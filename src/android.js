const fs = require('fs-extra');
const execa = require('execa');
const logger = require('./logger');
const plist = require('plist');
const path = require('path');
const config = require("./config");
const exec = require('./exec');

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

async function generateSignedApk() {
    const ksData = config.keystoreDetails;
    const namesArr = ksData.keyStore.split('/');
    const keystoreName = namesArr[namesArr.length - 1];
    // http://reactnative.dev/docs/signed-apk-android
    const filepath = config.src + 'android/app/' + keystoreName;
    fs.copyFileSync(ksData.keyStore, filepath);

    // edit file android/gradle.properties
    const gradlePath = config.src + 'android/gradle.properties';
    if (fs.existsSync(gradlePath)) {
        let data = fs.readFileSync(gradlePath, 'utf8');
        console.log(data);

        let content = await setKeyStoreValuesInGradleProps(data, keystoreName, ksData);
        fs.writeFileSync(gradlePath, content);
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
        // TODO: check if version has to be updated for FLIPPER_VERSION,
        // npm info flipper => will give the version
        // check https://fbflipper.com/docs/getting-started/react-native/
        if(e.message.includes('FLIPPER_VERSION')) {
            const gradlePath = config.src + 'android/gradle.properties';
            if (fs.existsSync(gradlePath)) {
                let data = fs.readFileSync(gradlePath, 'utf8');
                console.log(data);
                fs.writeFileSync(gradlePath, data.concat(` \n FLIPPER_VERSION=0.96.1`));
            }
            generateAab();
        }
    }
    
}

async function generateReleaseApk() {
    
}

module.exports = {
    generateSignedApk: generateSignedApk
}