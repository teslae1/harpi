#!/usr/bin/env node

const { program } = require('commander');
const { run, ls } = require('./harpiFunctions');

program
    .command('run <harpiYmlFile> [requestId]')
    .description('Executes http requests found in harpi.yml file. If order/request id is used will only exucute single request')
    .option('-v, --verbose', 'For full request bodies')
    .option('-variables, --variables <items>', 'Variables to use during this run')
    .option('-o, --output <file>', 'Write log outputs to file')
    .option('-b, --bail', 'Exit on any failed assert')
    .option('--insecure', 'Run with disable tlc reject unauthorized')
    .action(async (harpiYmlFile, requestId, cmdObj) => {
        let verbose = cmdObj.verbose;
        if(verbose == undefined){
            verbose = false;
        }
        let bail = cmdObj.bail;
        if(bail == undefined){
            bail = false;
        }
        let variables = cmdObj.variables;
        let outputFile = cmdObj.output;
        let insecure = cmdObj.insecure;
        if(insecure == undefined){
            insecure = false;
        }
        let exitCode = 0;
        try{
            exitCode = await run(harpiYmlFile, 
            requestId, 
            verbose, 
            variables,
            outputFile,
            bail,
            insecure);
        }
        catch(error){
            console.log('\x1b[31m%s\x1b[0m', error);
            exitCode = 1;
        }

        process.exit(exitCode);
    });

program
    .command('ls [harpiYmlFile]')
    .description('Displays all available harpi files from this directory all subdirectories')
    .option('-v, --verbose', 'For full request bodies')
    .option('-variables, --variables <items>', 'Variables to use during this run')
    .action(async (harpiYmlFile, cmdObj) => {
        let verbose = cmdObj.verbose;
        let variables = cmdObj.variables;
        if(verbose == undefined){
            verbose = false;
        }
        try{
        await ls(harpiYmlFile, verbose, variables);
        }
        catch(error){
            console.log('\x1b[31m%s\x1b[0m', error);
        }
    });

program.parse(process.argv);

