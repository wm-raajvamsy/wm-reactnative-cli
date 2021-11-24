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
    hasValidNodeVersion,
    hasValidJavaVersion,
    checkForGradleAvailability,
    isGitInstalled,
    hasYarnPackage,
    hasValidExpoVersion
 } = require('./requirements');

 const config = require('./config');
 const { invokeiosBuild } = require('./ios');
const { resolve } = require('path');
const loggerLabel = 'wm-reactnative-cli';

function getFileSize(path) {
    const stats = path && fs.statSync(path);
    return (stats && stats['size']) || 0;
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
                    logger.info({
                        'label': loggerLabel,
                        'message': 'updated package.json file'
                    });
                    resolve('success');
                });
            })
        } catch (e) {
            resolve('error', e);
        }
    })
}

async function updateAppJsonFile(content, src) {
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
                    if (config.metaData.id) {
                        jsonData['expo']['android']['package'] = config.metaData.id;
                        jsonData['expo']['ios']['bundleIdentifier'] = config.metaData.id;
                    }
                    jsonData['expo']['jsEngine'] = config.metaData.preferences.enableHermes ? 'hermes' : 'jsc'; 
                    if (config.metaData.icon) {
                        jsonData['expo']['icon'] = config.metaData.icon.src;
                        jsonData['expo']['splash']['image'] = config.metaData.splash.src;
                        jsonData['expo']['android']['adaptiveIcon']['foregroundImage'] = config.metaData.icon.src;
                    }
                    await fs.writeFile(path, JSON.stringify(jsonData), error => {
                        if (error) {
                            throw error;
                        }
                        resolve('success');
                        logger.info({
                            'label': loggerLabel,
                            'message': 'updated app.json file'
                        });
                    })
                });
            }
        } catch (e) {
            resolve('error', e);
        }
    })
}

 async function build(args) {
    const directories = await setupBuildDirectory(args.src, args.dest, args.platform);
    if (!directories) {
        return {
            success : false,
            errors: 'could not setup the build directories.'
        };
    }
    args.src = directories.src;
    args.dest = directories.dest
     if (!args.autoEject) {
        const response = await showConfirmation('Would you like to eject the expo project (yes/no) ?');
        if (response !== 'y' && response !== 'yes') {
            process.exit();
        }
     }
     config.metaData = await readWmRNConfig(args.src);

     if (config.metaData.icon.src.startsWith('resources')) {
        config.metaData.icon.src = 'src/' + config.metaData.icon.src;
     }
     if (config.metaData.splash.src.startsWith('resources')) {
        config.metaData.splash.src = 'src/' + config.metaData.splash.src;
     }

     config.platform = args.platform;
     let response;
     if (args.dest) {
        args.dest = path.resolve(args.dest) + '/';
        if (!config.metaData.ejected) {
            response = await ejectProject(args);
        }
    } else {
        response = await ejectProject(args);
    }

    if (response && response.errors) {
        return response;
    }

    if (args.dest) {
        config.src = args.dest;
    }
    config.outputDirectory = config.src + 'output/';
    config.logDirectory = config.outputDirectory + 'logs/';
    logger.info({
        label: loggerLabel,
        message: `Building at : ${config.src}`
    });

    try {
        let result;
        if (config.platform === 'android') {
            result = await android.invokeAndroidBuild(args);
        } else if (config.platform === 'ios') {
            // await exec('pod', ['install'], {
            //     cwd: config.src + 'ios'
            // });
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
        logger.error({
            label: loggerLabel,
            message: 'BUILD Failed. Due to :' + e
        });
        return {
            success : false,
            errors: e
         };
    }
}

async function extractRNZip(src)  {
    let folderName = src.split('/').pop();
    const isZipFile = folderName.endsWith('.zip');

    folderName = isZipFile ? folderName.replace('.zip', '') : folderName;

    const tmp = `${require('os').homedir()}/.wm-reactnative-cli/temp/${folderName}/${Date.now()}`;

    if (src.endsWith('.zip')) {
        const zipFile = src;
        src = tmp + '/src';

        if (!fs.existsSync(src)) {
            fs.mkdirsSync(src);
        }

        await exec('unzip', [
            '-o',
            zipFile,
            '-d',
            src
        ]);
    }
    return path.resolve(src) + '/';
}

async function setupBuildDirectory(src, dest, platform) {
    src = await extractRNZip(src);
    const metadata = await readWmRNConfig(src);
    if (fs.existsSync(dest)) {
        if (fs.readdirSync(dest).length) {
            const response = await showConfirmation('Would you like to empty the dest folder (i.e. ' + dest + ') (yes/no) ?');
            if (response !== 'y' && response !== 'yes') {
                logger.error({
                    label: loggerLabel,
                    message: 'source and destination folders are same. Please choose a different destination.'
                });
                return;
            }
            // using removeSync when dest is directory and unlinkSync works when dest is file.
            const fsStat = fs.lstatSync(dest);
            if (fsStat.isDirectory()) {
                fs.removeSync(dest);
            } else if (fsStat.isFile()) {
                fs.unlinkSync(dest);
            }
        }
    }
    dest = dest || await getDefaultDestination(metadata.id, platform);
    dest = path.resolve(dest)  + '/';
    if(src === dest) {
        logger.error({
            label: loggerLabel,
            message: 'source and destination folders are same. Please choose a different destination.'
        });
        return;
    }
    fs.mkdirsSync(dest);
    fs.copySync(src, dest);
    const logDirectory = dest + 'output/logs/';
    fs.mkdirSync(logDirectory, {
        recursive: true
    });
    logger.setLogDirectory(logDirectory);
    return {
        src: src,
        dest: dest
    };
}

async function getDefaultDestination(id, platform) {
    const version = '1.0.0';
    const path = `${require('os').homedir()}/.wm-reactnative-cli/build/${id}/${version}/${platform}`;
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
        logger.info({
            'label': loggerLabel,
            'message': 'updated wm_rn_config.json file'
        })
    })
}

// src points to unzip proj
async function ejectProject(args) {
    try {
        config.src = args.dest;
        logger.info({
            label: loggerLabel,
            message: 'destination folder where app is build at ' + args.dest
        })
        if (!args.platform) {
            args.platform = 'android';
        }
        config.platform = args.platform;
        config.buildType = args.buildType;

        if (!await hasValidNodeVersion() || !await hasValidJavaVersion() || !await hasYarnPackage() ||
            !await checkForGradleAvailability() || !await isGitInstalled() || !await hasValidExpoVersion()) {
            return {
                errors: 'check if all prerequisites are installed.',
                success: false
            }
        }
        await updateAppJsonFile({
            'name': config.metaData.name,
            'slug': config.metaData.name
        }, config.src);
        await updatePackageJsonFile(config.src + 'package.json');
        await exec('yarn', ['install'], {
            cwd: config.src
        });
        // expo eject checks whether src is a git repo or not
        await exec('git', ['init'], {
            cwd: config.src
        });
        logger.info({
            'label': loggerLabel,
            'message': 'invoking expo eject'
        });
        await exec('expo', ['eject'], {
            cwd: config.src
        });
        logger.info({
            'label': loggerLabel,
            'message': 'expo eject succeeded'
        });
        if (args.localrnruntimepath) {
            const linkFolderPath = config.src + 'node_modules/@wavemaker/app-rn-runtime';
            // using removeSync when target is directory and unlinkSync works when target is file.
            if (fs.existsSync(linkFolderPath)) {
                fs.removeSync(linkFolderPath);
            }
            await fs.mkdirsSync(linkFolderPath);
            await fs.copySync(args.localrnruntimepath, linkFolderPath);
            logger.info({
                'label': loggerLabel,
                'message': 'copied the app-rn-runtime folder'
            })
        }
        await writeWmRNConfig({ejected: true});
    } catch (e) {
        logger.error({
            label: loggerLabel,
            message: args.platform + ' eject project Failed. Due to :' + e
        });
        return { errors: e, success : false };
    }
}

module.exports = {
    ejectProject: ejectProject,
    build: build
}
