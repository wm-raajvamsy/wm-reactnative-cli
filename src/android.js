const fs = require('fs-extra');
const execa = require('execa');
const logger = require('./logger');
const plist = require('plist');
const path = require('path');
const config = require('./config');
const exec = require('./exec');

const {
    validateForAndroid,
    hasValidNodeVersion,
    hasValidJavaVersion,
    checkForGradleAvailability,
    isGitInstalled,
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
async function generateSignedApk(keyStore, storePassword, keyAlias, keyPassword) {
    const ksData = {storePassword: storePassword, keyAlias: keyAlias, keyPassword: keyPassword};
    const namesArr = keyStore.split('/');
    const keystoreName = namesArr[namesArr.length - 1];
    const filepath = config.src + 'android/app/' + keystoreName;

    fs.copyFileSync(ksData.keyStore, filepath);

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
    await generateAab();
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

function setSigningConfigInGradle() {
    const gradlePath = config.src + 'android/app/build.gradle';

    let content = fs.readFileSync(gradlePath, 'utf8');
    content = updateSigningConfig(content);
    fs.writeFileSync(gradlePath, content);

    generateAab();
}

async function generateAab() {
    try {
        await execa('./gradlew', ['clean'], {
            cwd: config.src + 'android'
        });
        await execa('./gradlew', [':app:bundleRelease'], {
            cwd: config.src + 'android'
        });

        await execa('react-native', ['run-android', '--variant=release'], {
            cwd: config.src
        });
    }
    catch(e) {
        console.error('error generating release apk. ', e);
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
        .replace(/devDisabledInDebug\: false/gm, `devDisabledInDebug: true`);
    }
	return newContent;
}
function setReleaseFlagInGradle(content) {
    const newContent = content.replace(/^(?!\s)project\.ext\.react = \[/gm, `project.ext.react = [
        entryFile: "index.js",
        bundleAssetName: "index.android.bundle",
        bundleInRelease: true,`);

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
    content = type === 'production' ? await setReleaseFlagInGradle(content) : await setDebugFlagInGradle(content);
    await fs.writeFileSync(path, content);
}

async function invokeAndroidBuild(args) {
    let keyStore, storePassword, keyAlias,keyPassword;

    if (args.packageType === 'development' && !args.aKeyStore) {
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

    if (!await hasValidNodeVersion() || !await hasValidJavaVersion() ||
        !await checkForGradleAvailability() || !await isGitInstalled() ||
        !await checkForAndroidStudioAvailability()) {
        return {
            success: false
        }
    }

    if (args.packageType === 'production') {
        const errors = validateForAndroid(keyStore, storePassword, keyAlias, keyPassword);
        if (errors.length > 0) {
            return {
                success: false,
                errors: errors
            }
        }
        await updateAndroidBuildGradleFile(args.packageType);
        await generateSignedApk(keyStore, storePassword, keyAlias, keyPassword);
    } else {
        await updateAndroidBuildGradleFile(args.packageType);
        logger.info({
            label: loggerLabel,
            message: 'Updated build.gradle file with debug configuration'
        });
        await execa('./gradlew', ['clean'], {
            cwd: config.src + 'android'
        });
        await execa('./gradlew', ['assembleDebug'], {
            cwd: config.src + 'android'
        });
        logger.info({
            label: loggerLabel,
            message: 'build completed'
        });
        const output =  args.dest + 'output/android/';
        if (!Object.keys(config.metaData).length) {
            config.metaData = await config.setMetaInfo(config.src);
        }
        const appName = config.metaData.expo.name;
        const outputFilePath = `${output}${appName}(${config.metaData.expo.version}).${args.packageType}.apk`;
        const apkPath = findFile(`${args.dest}/android/app/build/outputs/apk/${args.packageType === 'production' ? 'release' : 'debug'}`, /\.apk?/);
        fs.mkdirSync(output, {recursive: true});
        fs.copyFileSync(apkPath, outputFilePath);
        return {
            success: true,
            output: outputFilePath
        };
    }
}

module.exports = {
    generateSignedApk: generateSignedApk,
    invokeAndroidBuild: invokeAndroidBuild
}
