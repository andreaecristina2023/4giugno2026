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
    </application>'''
    s = s.replace('</application>', ricevitore, 1)
permessi = [
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
    '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
]
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
