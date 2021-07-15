const fs = require('fs-extra');
const logger = require('./logger');
const plist = require('plist');
const path = require('path');
const android = require('./android');
const { showConfirmation } = require('./requirements');
const {
    exec
} = require('./exec');

const {
    hasValidNodeVersion
 } = require('./requirements');

 const config = require('./config');
 const { invokeiosBuild } = require('./ios');
const { resolve } = require('path');
const loggerLabel = 'wm-reactnative-cli';

function getFileSize(path) {
    const stats = path && fs.statSync(path);
    return (stats && stats['size']) || 0;
}

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
            fs.readFile(path, async function(error, data) {
                if (error) {
                    throw error;
                }
                var jsonData = JSON.parse(data);
                jsonData['main'] = "index";
                await fs.writeFile(path, JSON.stringify(jsonData), error => {
                    if (error) {
                        throw error;
                    }
                    console.log('updated package.json file');
                    resolve('success');
                });
            })
        } catch (e) {
            resolve('error', e);
        }
    })
}

async function updateAppJsonFile(content, appId, src) {
    return await new Promise(resolve => {
        try {
            const path = (src || config.src) + 'app.json';
            if (fs.existsSync(path)) {
                fs.readFile(path, async function(error, data) {
                    if (error) {
                        throw error;
                    }
                    var jsonData = JSON.parse(data);
                    if (content) {
                        Object.assign(jsonData['expo'], content);
                    }
                    if (appId) {
                        jsonData['expo']['android']['package'] = appId;
                        jsonData['expo']['ios']['bundleIdentifier'] = appId;
                    }
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

 async function build(args) {
     if (!args.autoEject) {
        const response = await showConfirmation('Would you like to eject the expo project (yes/no) ?');
        if (response !== 'y' && response !== 'yes') {
            process.exit();
        }
     }
     config.metaData = await readWmRNConfig(args.src);

     if (args.dest) {
        args.dest = path.resolve(args.dest) + '/';
        // Do not eject again if its already ejected in dest folder
        if (!fs.existsSync(args.dest + 'app.json')) {
            await ejectProject(args);
        } else {
            if (!config.metaData.ejected) {
                await ejectProject(args);
            }
        }
    } else {
        await ejectProject(args);
    }

    config.buildType = args.platform;
    if (args.dest) {
        config.src = args.dest;
    }
    config.outputDirectory = config.src + 'output/';
    fs.mkdirSync(config.outputDirectory, {
        recursive: true
    });
    config.logDirectory = config.outputDirectory + 'logs/';
    fs.mkdirSync(config.logDirectory, {
        recursive: true
    });
    logger.setLogDirectory(config.logDirectory);
    logger.info({
        label: loggerLabel,
        message: `Building at : ${config.src}`
    });

    try {
        let result;
        if (config.buildType === 'android') {
            result = await android.invokeAndroidBuild(args);
        } else if (config.buildType === 'ios') {
            updateExpoplistFile();

            await exec('pod', ['install'], {
                cwd: config.src + 'ios'
            });
            await exec('react-native', ['run-ios'], {
                cwd: config.src
            });
            result = await invokeiosBuild(args);
        }
        if (result.errors && result.errors.length) {
            logger.error({
                label: loggerLabel,
                message: args.platform + ' build failed due to: \n\t' + result.errors.join('\n\t')
            });
        } else if (!result.success) {
            logger.error({
                label: loggerLabel,
                message: args.platform + ' BUILD FAILED'
            });
        } else {
            logger.info({
                label: loggerLabel,
                message: `${args.platform} BUILD SUCCEEDED. check the file at : ${result.output}.`
            });
            logger.info({
                label: loggerLabel,
                message: `File size : ${Math.round(getFileSize(result.output) * 100 / (1024 * 1024)) / 100} MB.`
            });
        }
        return result;
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

async function getDefaultDestination() {
    const id = config.metaData.id;
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

async function readWmRNConfig(src) {
    src = path.resolve(src) + '/';
    let jsonPath = src + 'wm_rn_config.json';
    let data = await fs.readFileSync(jsonPath);
    return JSON.parse(data);
}

async function writeWmRNConfig(content) {
    src = path.resolve(config.src) + '/';
    let jsonPath = src + 'wm_rn_config.json';
    let data = await fs.readFileSync(jsonPath);
    data = JSON.parse(data);
    if (content) {
        Object.assign(data, content);
    }
    await fs.writeFile(jsonPath, JSON.stringify(data), error => {
        if (error) {
            throw error;
        }
        resolve('success');
        console.log('updated app.json file');
    })
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
            args.dest = await getDefaultDestination(args.appId);
        }
        args.dest = path.resolve(args.dest)  + '/';

        if(args.src === args.dest) {
            logger.error({
                label: loggerLabel,
                message: 'source and destination folders are same. Please choose a different destination.'
            });
        }
        await setupBuildDirectory(args.src, args.dest);
        config.src = args.dest;
        logger.info({
            label: loggerLabel,
            message: 'destination folder where app is build at ' + args.dest
        })
    if (!args.buildType) {
        args.buildType = 'android';
    }
    config.buildType = args.buildType;

    if (!await hasValidNodeVersion(config.src)) {
        return false;
    }
    await updateAppJsonFile({
        'name': config.metaData.name,
        'slug': config.metaData.name
    }, config.metaData.id, args.src);
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
        await fs.mkdirsSync(linkFolderPath);
        await fs.copySync(args.localrnruntimepath, linkFolderPath);
        console.log('copied the app-rn-runtime folder');
    }
    await exec('git', ['init'], {
        cwd: config.src
    });
    console.log('invoking expo eject');
    await exec('expo', ['eject'], {
        cwd: config.src
    });
    console.log('expo eject succeded');
    await writeWmRNConfig({ejected: true});
    console.log('write failed');
} catch (e) {
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
