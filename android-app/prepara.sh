#!/usr/bin/env bash
# Prepara il progetto Android partendo dal sito (cartella superiore).
# Uso: cd android-app && npm ci && bash prepara.sh   (poi: cd android && ./gradlew assembleRelease)
set -euo pipefail
cd "$(dirname "$0")"
PKG_DIR=android/app/src/main/java/it/andreaecristina/casa

# 1. copia del sito dentro l'app (funziona offline)
rm -rf www && mkdir -p www
cp -r ../index.html ../manifest.webmanifest ../css ../js ../fonts ../icons www/
# runtime JS di Capacitor (registerPlugin) caricato solo nell'app, prima degli altri script
cp node_modules/@capacitor/core/dist/capacitor.js www/js/capacitor.js
sed -i 's#<script src="js/core.js"></script>#<script src="js/capacitor.js"></script>\n<script src="js/core.js"></script>#' www/index.html

# 2. progetto Android generato da Capacitor (non è nel repository)
[ -d android ] || npx cap add android
npx cap sync android

# 3. codice nativo: widget e plugin
cp native/java/*.java "$PKG_DIR/"
cp -r native/res/. android/app/src/main/res/

# 3b. app separata "A&C VPN" (Accessibilità): modulo :vpn nello stesso progetto, stessa firma di A&C
rm -rf android/vpn && cp -r vpn-app android/vpn
grep -q "include ':vpn'" android/settings.gradle || printf "\ninclude ':vpn'\n" >> android/settings.gradle
for d in android/app/src/main/res/mipmap-*; do mkdir -p "android/vpn/src/main/res/$(basename "$d")"; cp "$d"/ic_launcher*.* "android/vpn/src/main/res/$(basename "$d")/" 2>/dev/null || true; done
cp native/res/values/ic_launcher_background.xml android/vpn/src/main/res/values/
sed -i "s/versionCode 1$/versionCode ${GITHUB_RUN_NUMBER:-1}/; s/versionName \"1.0\"/versionName \"1.0.${GITHUB_RUN_NUMBER:-1}\"/" android/vpn/build.gradle

# 4. manifest: widget, permessi notifiche e sveglie esatte
python3 - <<'PY'
p = 'android/app/src/main/AndroidManifest.xml'
s = open(p, encoding='utf-8').read()
if 'CasaWidget' not in s:
    ricevitore = '''
        <receiver android:name=".CasaWidget" android:exported="false" android:label="A&amp;C">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_casa_info" />
        </receiver>
        <receiver android:name=".RifiutiWidget" android:exported="false" android:label="A&amp;C Rifiuti">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_rifiuti_info" />
        </receiver>
        <receiver android:name=".FotoWidget" android:exported="false" android:label="A&amp;C Foto">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_foto_info" />
        </receiver>
        <receiver android:name=".ComandiWidget" android:exported="false" android:label="A&amp;C Comandi">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_comandi_info" />
        </receiver>
        <receiver android:name=".TurnoAuto" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
        <activity android:name=".ModiPopup" android:exported="false" android:taskAffinity="" android:excludeFromRecents="true" android:noHistory="true"
            android:theme="@android:style/Theme.Translucent.NoTitleBar" android:label="Modi" />
        <receiver android:name=".VpnEvento" android:exported="true" android:permission="it.andreaecristina.casa.permission.VPN" />
        <receiver android:name=".SvegliaTurno" android:exported="false" />
        <service android:name=".SvegliaSuono" android:exported="false" android:foregroundServiceType="mediaPlayback" />
        <service android:name=".AlbaLuce" android:exported="false" android:foregroundServiceType="dataSync" />
        <activity android:name=".SvegliaSchermo" android:exported="false" android:showWhenLocked="true" android:turnScreenOn="true"
            android:excludeFromRecents="true" android:taskAffinity="" android:launchMode="singleInstance"
            android:theme="@android:style/Theme.DeviceDefault.NoActionBar" />
        <activity android:name=".LuciPopup" android:exported="false" android:taskAffinity="" android:excludeFromRecents="true" android:noHistory="true"
            android:theme="@android:style/Theme.Translucent.NoTitleBar" android:label="Luci" />
        <activity android:name=".TvPopup" android:exported="false" android:taskAffinity="" android:excludeFromRecents="true" android:noHistory="true"
            android:theme="@android:style/Theme.Translucent.NoTitleBar" android:label="TV" />
        <service android:name=".FotoWidgetService" android:exported="false" android:permission="android.permission.BIND_REMOTEVIEWS" />
    </application>'''
    s = s.replace('</application>', ricevitore, 1)
permessi = [
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
    '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
    # sveglie del turnario: schermata a telefono bloccato e sveglie esatte (Android 12)
    '<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />',
    '<uses-permission android:name="android.permission.WAKE_LOCK" />',
    '<uses-permission android:name="android.permission.VIBRATE" />',
    '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />',
    # stato della VPN (widget e DNS)
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />',
    '<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />',
    # modi audio: Non disturbare, volumi, rotazione schermo
    '<uses-permission android:name="android.permission.ACCESS_NOTIFICATION_POLICY" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-permission android:name="android.permission.WRITE_SETTINGS" tools:ignore="ProtectedPermissions" />',
    # DNS privato: si concede solo dal computer con adb (vedi README)
    '<uses-permission android:name="android.permission.WRITE_SECURE_SETTINGS" tools:ignore="ProtectedPermissions" />',
    # sveglie nell'app Orologio
    '<uses-permission android:name="com.android.alarm.permission.SET_ALARM" />',
    # FortiClient: per poterlo trovare e aprire (Android 11+ nasconde le altre app)
    '<queries><package android:name="com.fortinet.forticlient_vpn" /><package android:name="com.fortinet.forticlient" /><package android:name="com.fortinet.forticlient_fa" /><package android:name="it.andreaecristina.casa.vpn" /><package android:name="com.spotify.music" /></queries>',
    # A&C e A&C VPN si parlano solo tra loro (stessa firma)
    '<permission android:name="it.andreaecristina.casa.permission.VPN" android:protectionLevel="signature" />',
    '<uses-permission android:name="it.andreaecristina.casa.permission.VPN" />',
]
if 'xmlns:tools=' not in s:
    s = s.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1)
for x in permessi:
    if x not in s:
        s = s.replace('</manifest>', '    ' + x + '\n</manifest>', 1)
open(p, 'w', encoding='utf-8').write(s)

# versione dell'app = numero della build di GitHub Actions
import os, re
g = 'android/app/build.gradle'
b = open(g, encoding='utf-8').read()
n = os.environ.get('GITHUB_RUN_NUMBER', '1')
b = re.sub(r'versionCode \d+', 'versionCode ' + n, b)
b = re.sub(r'versionName "[^"]*"', 'versionName "1.0.' + n + '"', b)
open(g, 'w', encoding='utf-8').write(b)

# colori della barra di stato e splash
st = 'android/app/src/main/res/values/styles.xml'
t = open(st, encoding='utf-8').read()
t = t.replace('<item name="colorPrimary">@color/colorPrimary</item>', '<item name="colorPrimary">#7A1F3D</item>')
open(st, 'w', encoding='utf-8').write(t)
PY
echo "Progetto Android pronto."
