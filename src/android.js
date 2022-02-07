const fs = require('fs-extra');
const logger = require('./logger');
const config = require('./config');
const {
    exec
} = require('./exec');

const {
    validateForAndroid,
    checkForAndroidStudioAvailability
 } = require('./requirements');

const loggerLabel = 'android-build';

function setKeyStoreValuesInGradleProps(content, keystoreName, ksData) {
    // TODO: if key pwds are changed, then just update the values.
    if(content.search(/MYAPP_UPLOAD_STORE_PASSWORD/gm) == -1) {
        return content.concat(` \n MYAPP_UPLOAD_STORE_FILE=${keystoreName}
        MYAPP_UPLOAD_KEY_ALIAS=${ksData.keyAlias}
        MYAPP_UPLOAD_STORE_PASSWORD=${ksData.storePassword}
        MYAPP_UPLOAD_KEY_PASSWORD=${ksData.keyPassword}`);
    }
    return content;
}
// Reference: http://reactnative.dev/docs/signed-apk-android
async function generateSignedApk(keyStore, storePassword, keyAlias, keyPassword, packageType) {
    const ksData = {storePassword: storePassword, keyAlias: keyAlias, keyPassword: keyPassword};
    const namesArr = keyStore.split('/');
    const keystoreName = namesArr[namesArr.length - 1];
    const filepath = config.src + 'android/app/' + keystoreName;

    fs.copyFileSync(keyStore, filepath);

    // edit file android/gradle.properties
    const gradlePropsPath = config.src + 'android/gradle.properties';
    if (fs.existsSync(gradlePropsPath)) {
        let data = fs.readFileSync(gradlePropsPath, 'utf8');
        let content = await setKeyStoreValuesInGradleProps(data, keystoreName, ksData);
        fs.writeFileSync(gradlePropsPath, content);
    }

    const appGradlePath = config.src + 'android/app/build.gradle';
    let content = fs.readFileSync(appGradlePath, 'utf8');
    content = await updateSigningConfig(content);
    fs.writeFileSync(appGradlePath, content);
    await generateAab(packageType);
}

function updateSigningConfig(content) {
    // TODO: replace one of the buildTypes to signingConfigs.release
    if(content.search(/if \(project.hasProperty\(\'MYAPP_UPLOAD_STORE_FILE\'\)\)/gm) == -1) {
        return content.replace(/signingConfigs \{/gm, `signingConfigs {
            release {
                if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                    storeFile file(MYAPP_UPLOAD_STORE_FILE)
                    storePassword MYAPP_UPLOAD_STORE_PASSWORD
                    keyAlias MYAPP_UPLOAD_KEY_ALIAS
                    keyPassword MYAPP_UPLOAD_KEY_PASSWORD
                }
            }`);
    }
    return content;
}

function updateJSEnginePreference() {
    const jsEngine = require(config.src + 'app.json').expo.jsEngine;
    const gradlePropsPath = config.src + 'android/gradle.properties';
    if (fs.existsSync(gradlePropsPath)) {
        let data = fs.readFileSync(gradlePropsPath, 'utf8');
        data = data.replace(/expo\.jsEngine=(jsc|hermes)/, `expo.jsEngine=${jsEngine}`)
        fs.writeFileSync(gradlePropsPath, data);
        logger.info({
            label: loggerLabel,
            message: `js engine is set as ${jsEngine}`
        });
    }
}

function setSigningConfigInGradle() {
    const gradlePath = config.src + 'android/app/build.gradle';

    let content = fs.readFileSync(gradlePath, 'utf8');
    content = updateSigningConfig(content);
    fs.writeFileSync(gradlePath, content);

    generateAab();
}

async function generateAab(packageType) {
    try {
        await exec('./gradlew', ['clean'], {
            cwd: config.src + 'android'
        });
        if (packageType === 'bundle') {
            await exec('./gradlew', [':app:bundleRelease'], {
                cwd: config.src + 'android'
            });
        } else {
            await exec('./gradlew', ['assembleRelease'], {
                cwd: config.src + 'android'
            });
        }
    }
    catch(e) {
        console.error('error generating release apk. ', e);
        return {
            success: false,
            errors: e
        }
    }
}

function setDebugFlagInGradle(content) {
    let newContent;
    if (content.search(`entryFile: "index.js"`) === -1) {
    newContent = content.replace(/^(?!\s)project\.ext\.react = \[/gm, `project.ext.react = [
        entryFile: "index.js",
        bundleAssetName: "index.android.bundle",
        bundleInDebug: true,
        devDisabledInDebug: true,`);
    } else {
        newContent = content.replace(/bundleInDebug\: false/gm, `bundleInDebug: true`)
            .replace(/devDisabledInDebug\: false/gm, `devDisabledInDebug: true`)
            .replace(/bundleInRelease\: true/gm, `bundleInRelease: false`);
    }
	return newContent;
}
function setReleaseFlagInGradle(content) {
    let newContent;
    if (content.search(`entryFile: "index.js"`) === -1) {
        newContent = content.replace(/^(?!\s)project\.ext\.react = \[/gm, `project.ext.react = [
        entryFile: "index.js",
        bundleAssetName: "index.android.bundle",
        bundleInRelease: true,`);
    } else {
        newContent = content.replace(/bundleInDebug\: true/gm, `bundleInDebug: false,
        bundleInRelease: true,`).replace(/devDisabledInDebug\: true/gm, ``)
            .replace(/bundleInRelease\: false/gm, `bundleInRelease: true`);
    }
    return newContent;
}

const endWith = (str, suffix) => {
    if (!str.endsWith(suffix)) {
        return str += suffix;
    }
    return str;
};

function findFile(path, nameregex) {
    const files = fs.readdirSync(path);
    const f = files.find(f => f.match(nameregex));
    return endWith(path, '/') + f;
}

async function updateAndroidBuildGradleFile(type) {
    const path = config.src + 'android/app/build.gradle';
    let data = fs.readFileSync(path, 'utf8');
    console.log(data);

    let content = fs.readFileSync(path, 'utf8');
    content = type === 'release' ? await setReleaseFlagInGradle(content) : await setDebugFlagInGradle(content);
    await fs.writeFileSync(path, content);
}

async function updateSettingsGradleFile(appName) {
    const path = config.src + 'android/settings.gradle';
    let content = fs.readFileSync(path, 'utf8');
    if (content.search(/^rootProject.name = \'\'/gm) > -1) {
        content = content.replace(/^rootProject.name = \'\'/gm, `rootProject.name = ${appName}`);
        await fs.writeFileSync(path, content);
    }
}

async function invokeAndroidBuild(args) {
    let keyStore, storePassword, keyAlias,keyPassword;

    if (args.buildType === 'debug' && !args.aKeyStore) {
        keyStore = __dirname + '/../defaults/android-debug.keystore';
        keyAlias = 'androiddebugkey';
        keyPassword = 'android';
        storePassword = 'android';
    } else {
        keyStore = args.aKeyStore,
        storePassword = args.aStorePassword,
        keyAlias = args.aKeyAlias,
        keyPassword = args.aKeyPassword
    }

    if (!await checkForAndroidStudioAvailability()) {
        return {
            success: false
        }
    }

    updateJSEnginePreference();
    const appName = config.metaData.name;
    await updateSettingsGradleFile(appName);

    if (args.buildType === 'release') {
        const errors = validateForAndroid(keyStore, storePassword, keyAlias, keyPassword);
        if (errors.length > 0) {
            return {
                success: false,
                errors: errors
            }
        }
        await updateAndroidBuildGradleFile(args.buildType);
        await generateSignedApk(keyStore, storePassword, keyAlias, keyPassword, args.packageType);
    } else {
        await updateAndroidBuildGradleFile(args.buildType);
        logger.info({
            label: loggerLabel,
            message: 'Updated build.gradle file with debug configuration'
        });
        try {
        await exec('./gradlew', ['assembleDebug'], {
            cwd: config.src + 'android'
        });
    } catch(e) {
        console.error('error generating release apk. ', e);
        return {
            success: false,
            errors: e
        }
    }
    }
    logger.info({
        label: loggerLabel,
        message: 'build completed'
    });
    const output = args.dest + 'output/android/';
    const outputFilePath = `${output}${appName}(${config.metaData.version}).${args.buildType}.${args.packageType === 'bundle' ? 'aab': 'apk'}`;

    let bundlePath = null;
    let folder = args.buildType === 'release' ? 'release' : 'debug';
    if (args.packageType === 'bundle') {
        bundlePath = findFile(`${args.dest}android/app/build/outputs/bundle/${folder}`, /\.aab?/);
    } else {
        bundlePath = findFile(`${args.dest}android/app/build/outputs/apk/${folder}`, /\.apk?/);
    }
    fs.mkdirSync(output, {recursive: true});
    fs.copyFileSync(bundlePath, outputFilePath);
    return {
        success: true,
        output: outputFilePath
    };
}

module.exports = {
    generateSignedApk: generateSignedApk,
    invokeAndroidBuild: invokeAndroidBuild
}
