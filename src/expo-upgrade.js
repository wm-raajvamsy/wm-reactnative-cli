const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function validateArgs(args) {
    const errors = [];

    // Validate required arguments
    if (!args.src) {
        errors.push('Source path is required. Please provide the path to your React Native project.');
    }

    if (!args['expo-version']) {
        errors.push('Expo version is required. Please specify the version to upgrade to (e.g., 49.0.0).');
    }

    if (!args['gemini-key']) {
        errors.push('Gemini key is required for authentication. Please provide your Gemini API key.');
    }

    // If there are missing required arguments, don't proceed with other validations
    if (errors.length > 0) {
        console.error(chalk.red.bold('❌ Validation Errors:'));
        errors.forEach((error, index) => {
            console.error(chalk.red(`  ${index + 1}. ${error}`));
        });
        console.error(chalk.yellow('\n💡 Usage: wm-reactnative expo-upgrade <src> <expo-version> <gemini-key>'));
        process.exit(1);
    }

    // Validate source path exists
    const sourcePath = path.resolve(args.src);
    if (!fs.existsSync(sourcePath)) {
        errors.push(`Source path does not exist: ${sourcePath}`);
    }

    // Check if it's a valid React Native project
    const packageJsonPath = path.join(sourcePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        errors.push(`Invalid React Native project: package.json not found at ${sourcePath}`);
    }

    // Validate expo version format (basic validation)
    const expoVersion = args['expo-version'];
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(expoVersion)) {
        errors.push(`Invalid expo version format: ${expoVersion}. Expected format: X.Y.Z (e.g., 49.0.0)`);
    }

    // Validate Gemini key format (basic validation)
    const geminiKey = args['gemini-key'];
    if (!geminiKey || geminiKey.trim().length === 0) {
        errors.push('Gemini key cannot be empty.');
    } else if (geminiKey.length < 10) {
        errors.push('Gemini key appears to be invalid. Please check your API key.');
    }

    // Display all validation errors if any
    if (errors.length > 0) {
        console.error(chalk.red.bold('❌ Validation Errors:'));
        errors.forEach((error, index) => {
            console.error(chalk.red(`  ${index + 1}. ${error}`));
        });
        console.error(chalk.yellow('\n💡 Please fix the above errors and try again.'));
        process.exit(1);
    }

    return {
        sourcePath,
        expoVersion,
        geminiKey
    };
}

async function expoUpgrade(args) {
    try {
        // Validate all arguments
        const validatedArgs = validateArgs(args);

        // Log the validated arguments
        console.log(chalk.green.bold('✅ Validation passed! Starting Expo upgrade...'));
        console.log(chalk.blue('📋 Parameters:'));
        console.log(chalk.cyan(`  • Source path: ${validatedArgs.sourcePath}`));
        console.log(chalk.cyan(`  • Target Expo version: ${validatedArgs.expoVersion}`));
        console.log(chalk.cyan(`  • Gemini key: ${validatedArgs.geminiKey.substring(0, 8)}...`));

        // TODO: Implement actual expo upgrade logic here
        console.log(chalk.green('\n🚀 Expo upgrade validation completed successfully.'));
        console.log(chalk.yellow('⏳ Upgrade process would start here...'));

    } catch (error) {
        console.error(chalk.red.bold('❌ Expo upgrade failed:'));
        console.error(chalk.red(error.message));
        process.exit(1);
    }
}

module.exports = {
    expoUpgrade : expoUpgrade
};
