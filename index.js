#!/usr/bin/env node

const {
    ejectProject, build
} = require('./src/command');
const os = require('os');
const { LocalStorage } = require('node-localstorage');
const {
    runExpo
} = require('./src/expo-launcher');
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');
updateNotifier({
    pkg: pkg,
    updateCheckInterval : 60 * 60 * 1000
}).notify({
	defer: false
});

global.rootDir = `${os.homedir()}/.wm-reactnative-cli`;
global.localStorage = new LocalStorage(`${global.rootDir}/.store`);
// src is the web react native project zip
const args = require('yargs')
    .command('build', 'build the project to generate android and ios folders', yargs => {
            yargs.command('android [src] [options]', 'build for android', yargs => {
                yargs.option('appId', {
                    alias: 'appId',
                    describe: 'unique application identifier',
                    type: 'string'
                })
                .option('aks', {
                    alias: 'aKeyStore',
                    describe: '(Android) path to keystore',
                    type: 'string'
                })
                .option('asp', {
                    alias: 'aStorePassword',
                    describe: '(Android) password to keystore',
                    type: 'string'
                })
                .option('aka', {
                    alias: 'aKeyAlias',
                    describe: '(Android) Alias name',
                    type: 'string'
                })
                .option('akp', {
                    alias: 'aKeyPassword',
                    describe: '(Android) password for key.',
                    type: 'string'
                })
                .option('p', {
                    alias: 'packageType',
                    describe: 'apk (or) bundle',
                    default: 'apk',
                    choices: ['apk', 'bundle']
                })
            }, args => {
                args.platform = 'android';
                build(args)
            })
            .command('ios [src] [options]', 'build for iOS', yargs => {
                yargs.option('ic', {
                    alias: 'iCertificate',
                    describe: '(iOS) path of p12 certificate to use',
                    type: 'string'
                })
                .option('icp', {
                    alias: 'iCertificatePassword',
                    describe: '(iOS) password to unlock certificate',
                    type: 'string'
                })
                .option('ipf', {
                    alias: 'iProvisioningFile',
                    describe: '(iOS) path of the provisional profile to use',
                    type: 'string'
                });
            }, args => {
                args.platform = 'ios';
                build(args)
            })
            yargs.positional('src', {
                describe: 'path of rn project',
                default: './',
                type: 'string',
                normalize: true
            })
            .option('dest', {
                alias: 'dest',
                describe: 'dest folder where the react native project will be extracted to',
                type: 'string'
            })
            .option('bt', {
                alias: 'buildType',
                describe: 'development (or) debug (or) production (or) release',
                default: 'debug',
                coerce: (val) => {
                    if (val === 'development') {
                        return 'debug';
                    }
                    if (val === 'production') {
                        return 'release';
                    }
                    return val;
                },
                choices: ['development', 'debug', 'production', 'release']
            })
            .option('localrnruntimepath', {
                alias: 'localrnruntimepath',
                describe: 'local path pointing to the app-rn-runtime folder',
                type: 'string'
            })
            .option('auto-eject', {
                alias: 'autoEject',
                describe: 'If set to true then project will be eject automatically without prompting any confirmations',
                default: false,
                type: 'boolean'
            })
    })
    .command('run expo <previewUrl>',
        'launch local expo with a wavemaker project as source',
        yargs => {
            yargs.option('web', {
                describe: 'If set to true then web will be started.',
                default: false,
                type: 'boolean'
            });
            yargs.option('clean', {
                describe: 'If set to true then all existing folders are removed.',
                default: false,
                type: 'boolean'
            });
        },
        (args) => {
            runExpo(args.previewUrl, args.web, args.clean)
    })
    .help('h')
    .alias('h', 'help').argv;
