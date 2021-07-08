const fs = require('fs-extra');
const execa = require('execa');
const logger = require('./logger');
const plist = require('plist');
const path = require('path');
const android = require('./android');
const {
    exec
} = require('./exec');

const { 
    hasValidNodeVersion
 } = require('./requirements');

const config = require('./config');
const { invokeiosBuild } = require('./ios');
const { resolve } = require('path');
const loggerLabel = 'wm-rn-cli';

function updateExpoplistFile() {
    const iosPath =  config.src + 'ios';
    var filename = fs.readdirSync(iosPath).filter(v => {
        return v.endsWith('.xcodeproj') || v.endsWith('.xcworkspace');
    });
    filename = filename[0].replace('.xcworkspace', '').replace('.xcodeproj', '');
    console.log(filename);
// TODO add check if this already exists
    const plistPath = iosPath + '/' + filename + '/Supporting/Expo.plist';

    var obj = plist.parse(fs.readFileSync(plistPath, 'utf8'));
    console.log(JSON.stringify(obj));
    obj['EXUpdatesURL'] = 'https://wavemaker.com';
    console.log(JSON.stringify(obj));
    fs.writeFileSync(plistPath, plist.build(obj))
}

async function updatePackageJsonFile(path) {
    return await new Promise(resolve => {
        try {
    // TODO add main: "index"
    // if (fs.existsSync(path)) {
        fs.readFile(path, async function(error, data) {
            if (error) {
                throw error;
            }
            var jsonData = JSON.parse(data);
            // jsonData['main'] = "index";
            jsonData.dependencies['@react-native-async-storage/async-storage'] = '^1.15.5';
            jsonData.dependencies["react-native-safe-area-context"] = "^3.1.9";
            jsonData.dependencies["@react-native-community/cli"] = "^5.0.1";
            // TODO: check for version where to give
            // jsonData.dependencies["@wavemaker/app-rn-runtime"] = "^10.7.3-next.23051";

            // if (jsonData.devDependencies['@babel/core']) {
            //     delete jsonData.devDependencies['@babel/core']
            // }

            await fs.writeFile(path, JSON.stringify(jsonData), error => {
                if (error) {
                    throw error;
                }
                console.log('updated package.json file');
            });
            resolve('success');
        })
    // }
} catch (e) {
    resolve('error', e);
}
})
}

async function updateAppJsonFile(path, packageName, appName) {
    return await new Promise(resolve => {
        try {

    if (fs.existsSync(path)) {
        fs.readFile(path, async function(error, data) {
            if (error) {
                throw error;
            }
            var jsonData = JSON.parse(data);
            jsonData['expo']['android']['package'] = packageName;
            jsonData['expo']['ios']['bundleIdentifier'] = packageName;
            jsonData['expo']['name'] = appName;
            jsonData['expo']['slug'] = appName;
            await fs.writeFile(path, JSON.stringify(jsonData), error => {
                if (error) {
                    throw error;
                }
                resolve('success');
                console.log('updated app.json file');
            })
        });
        }
    } catch (e) {
        resolve('error', e);
    }
})
}

function setDebugFlagInGradle(content) {
    const newContent = content.replace(/^(?!\s)project\.ext\.react = \[/gm, `project.ext.react = [
        entryFile: "index.js",
        bundleAssetName: "index.android.bundle",
        bundleInDebug: true,
        bundleInRelease: false,`);

	return newContent;
}
function setReleaseFlagInGradle(content) {
    const newContent = content.replace(/^(?!\s)project\.ext\.react = \[/gm, `project.ext.react = [
        entryFile: "index.js",
        bundleAssetName: "index.android.bundle",
        bundleInDebug: false,
        bundleInRelease: true,`);

	return newContent;
}

async function updateAndroidBuildGradleFile(type) {
    const path = config.src + 'android/app/build.gradle';
    let data = fs.readFileSync(path, 'utf8');
    console.log(data);

    let content = fs.readFileSync(path, 'utf8');
    content = type === 'production' ? setReleaseFlagInGradle(content) : setDebugFlagInGradle(content);
    fs.writeFileSync(path, content);
}

async function waitForInfoplistToUpdate() {
    return await new Promise(resolve => {
        try {
        fs.readFile('/Users/bandhavyav/Projects/rn-build-apps/output/mysamplernappmaster1.xcarchive/Info.plist', async function (err, data) {
            const content = data.toString().replace('<key>ApplicationProperties</key>',
                `<key>compileBitcode</key>
            <true/>
            <key>provisioningProfiles</key>
            <dict>
                <key>com.wmapp.myrn</key>
                <string>xxxx</string>
            </dict>
            <key>ApplicationProperties</key>
            `);
            console.log('test ...');
            await fs.writeFile('/Users/bandhavyav/Projects/rn-build-apps/output/mysamplernappmaster1.xcarchive/Info.plist', Buffer.from(content));
            resolve('success');
        });
    } catch(e) {
        resolve('error');
        throw e;
    }
    });
}

 async function build(args) {
    config.buildType = args.platform;
    args.src = path.resolve(args.src) + '/';
    config.src = args.src;
   
    try {
        if (config.buildType === 'android') {
            // todo: mkdir assets
            // if (!fs.existsSync(config.src + 'android/app/src/main/assets')) {
            //     await execa('mkdir', ['android/app/src/main/assets'], {
            //         cwd: config.src
            //     });
            // }
            // await execa('npx', ['react-native', 'bundle', '--platform', 'android', '--dev', 'false', '--entry-file', 'index.js', '--bundle-output', 'android/app/src/main/assets/index.android.bundle', '--assets-dest', 'android/app/src/main/res'], {
            //     cwd: config.src
            // });
            // console.log('before run android');
            // await execa('react-native', ['start'], {
            //     cwd: config.src
            // });
            await execa('react-native', ['run-android'], {
                cwd: config.src
            });
            console.log('after run android start');
            if (args.packageType === 'production') {
                await updateAndroidBuildGradleFile(args.packageType);
                config.keystoreDetails = {
                    keyStore: args.aKeyStore,
                    storePassword: args.aStorePassword,
                    keyAlias: args.aKeyAlias,
                    keyPassword: args.aKeyPassword
                }
                // TODO: steps
                await android.generateSignedApk();
            }
        } else
         if (config.buildType === 'ios') {
            updateExpoplistFile();

            await execa('pod', ['install'], {
                cwd: config.src + 'ios'
            });
            await execa('react-native', ['run-ios'], {
                cwd: config.src
            });
            await invokeiosBuild(args);
        }
    } catch(e) {
        console.log('error...');
        logger.error({
            label: loggerLabel,
            message: 'BUILD Failed. Due to :' + e
        });
        console.error(e);
    }
}

async function setupBuildDirectory(src, dest) {
    const target = dest;
    if (fs.existsSync(target)) {
        if (fs.readdirSync(target).length) {
            const response = await showConfirmation('Would you like to empty the dest folder (i.e. ' + dest + ') (yes/no) ?');
            if (response !== 'y' && response !== 'yes') {
                process.exit();
            }
            // using removeSync when target is directory and unlinkSync works when target is file.
            const fsStat = fs.lstatSync(target);
            if (fsStat.isDirectory()) {
                fs.removeSync(target);
            } else if (fsStat.isFile()) {
                fs.unlinkSync(target);
            }
        }
    }
    fs.mkdirsSync(target);
    fs.copySync(src, dest);
}



async function getDefaultDestination(projectDir, platform, packageName) {
    // let data = fs.readFileSync(projectDir + 'config.xml').toString();
    // const config = et.parse(data);
    // const id = config.getroot().attrib['id'];
    // const version = config.getroot().attrib['version'];
    const id = packageName;
    const version = '1.0.0';
    const path = `${require('os').homedir()}/.wm-reactnative-cli/build/${id}/${version}/`;
    fs.mkdirSync(path, {
        recursive: true
    });
    let next = 1;
    if (fs.existsSync(path)) {
        next = fs.readdirSync(path).reduce((a, f) => {
            try {
                const c = parseInt(f);
                if (a <= c) {
                    return c + 1;
                }
            } catch(e) {
                //not a number
            }
            return a;
        }, next);
    }
    const dest = path + '/' + next;
    fs.mkdirSync(dest, {
        recursive: true
    });
    return dest;
}

// src points to unzip proj
async function ejectProject(args) {
    try {
        let folderName = args.src.split('/').pop();
        const isZipFile = folderName.endsWith('.zip');

        folderName = isZipFile ? folderName.replace('.zip', '') : folderName;

        const tmp = `${require('os').homedir()}/.wm-reactnative-cli/temp/${folderName}/${Date.now()}`;

        if (args.src.endsWith('.zip')) {
            const zipFile = args.src;
            args.src = tmp + '/src';

            if (!fs.existsSync(args.src)) {
                fs.mkdirsSync(args.src);
            }
    
            await exec('unzip', [
                '-o',
                zipFile,
                '-d',
                args.src
            ]);
        }
        args.src = path.resolve(args.src) + '/';

        if(!args.dest) {
            args.dest = await getDefaultDestination(args.src, args.platform, args.packagename);
        }
        args.dest = path.resolve(args.dest)  + '/';
        if (!isZipFile) {
            args.dest += folderName + '/';
        }
        if(args.src === args.dest) {
            logger.error({
                label: loggerLabel,
                message: 'source and destination folders are same. Please choose a different destination.'
            });
        }
        await setupBuildDirectory(args.src, args.dest);
        if (isZipFile) {
            args.dest += folderName + '/';
        }
        config.src = args.dest;
    if (!args.buildType) {
        args.buildType = 'android';
    }
    config.buildType = args.buildType;

    if (!await hasValidNodeVersion(config.src)) {
        return false;
    } 
    await updateAppJsonFile(config.src + 'app.json', args.packagename, folderName);
    await updatePackageJsonFile(config.src + 'package.json');
    // yarn install --network-timeout=30000
    await exec('yarn', ['install'], {
        cwd: config.src
    });
    if (args.localrnruntimepath) {
        const linkFolderPath = config.src + 'node_modules/@wavemaker/app-rn-runtime';
        // using removeSync when target is directory and unlinkSync works when target is file.
        if (fs.existsSync(linkFolderPath)) {
            fs.removeSync(linkFolderPath);
        }
        fs.mkdirsSync(linkFolderPath);
        fs.copySync(args.localrnruntimepath, linkFolderPath);
        console.log('copied the app-rn-runtime folder');
    }
    await execa('git', ['init'], {
        cwd: config.src
    });
    console.log('before expo eject');
    await execa('expo', ['eject'], {
        cwd: config.src
    });
    console.log('after expo eject');
}catch (e) {
    logger.error({
        label: loggerLabel,
        message: args.platform + ' BUILD Failed. Due to :' + e
    });
    console.error(e);
    return { success : false };
}
}

module.exports = {
    ejectProject: ejectProject,
    build: build
}