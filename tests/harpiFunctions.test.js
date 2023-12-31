

const { run, ls } = require('../harpiFunctions');
const axios = require('axios');
const fileHandler = require('../FileHandler');
const joinPathSegments = require('path').join;

const fakeFilePath = "testfile.harpi.yml";
var getRequestUrl = "https://www.get.com/api/get";
let harpiYml = 
    "requests: \n" + 
    `  - url: '${getRequestUrl}'\n` + 
    "    method: get";


//mock the axios function to when called with options where method is get and data is "myjson" return a result async
jest.mock('axios');

jest.mock('../FileHandler', () => ({
}));


describe('harpiFunctions.js', () =>{
	beforeEach(() => {
		jest.resetAllMocks();
	});

    it("Should exit zero when success", async () => {
		const fileWithFileExtension = "test.harpi.yml";
		fileHandler.addFileExtensionIfNone = jest.fn(file => fileWithFileExtension);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.readFileSync = jest.fn(file => harpiYml);
        const harpiYmlFile = "testfile";
        const requestId = undefined;
        const verbose = false;
        const variables = "val";
        const outputFile = undefined; 

      	let exitCode = await run(harpiYmlFile, requestId, verbose, variables, outputFile);

		expect(exitCode)
		.toEqual(0);
	});

	it("Should exit non zero when any failed test", async () => {
		const fileName = "file.harpi.yml";
		const requestId = undefined;
		const verbose = false;
		const variables = undefined;
		const outputFile = undefined;
		const bail = false;

		fileHandler.addFileExtensionIfNone = jest.fn(file => file);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.saveNewSession = jest.fn();
		const requestUrl = "https://api.com/failedasserttest";
		fileHandler.readFileSync = jest.fn(file => {
			if(file == fileName){
				return "requests: \n" + 
				"  - url: '"+requestUrl+"' \n" +
				"    method: get \n" +
				"    asserts: \n" + 
				"      statusCodeEquals: 200\n";
			}
		});

		axios.mockImplementation(async options => {
			if(options.url == requestUrl){
				return {status: 404};
			}
		}); 

		let exitCode = await run(fileName, 
			requestId, 
			verbose, 
			variables, 
			outputFile, 
			bail);

		expect(exitCode)
		.toEqual(1);
	});

	it("Should exit non zero when no file found", async () => {
		fileHandler.addFileExtensionIfNone = jest.fn();
		fileHandler.findHarpiYmlFile = jest.fn();

		let exitCode = await run("filename");

		expect(exitCode)
		.toEqual(1);
	});

	it("Should support cli variables that contain equals at end", async () => {

		const expValue = "ouhou.houewf.ouhwef==";
		const fileName = "test.harpi.yml";
		const requestId = undefined;
		const verbose = false;
		const variables = "token="+expValue;
		const bail = false;
		const outfile = undefined;
		const harpiYml = "variables: \n" +
		"  token: required \n" +
		"headers:  \n" + 
		"  Authorization: 'Bearer $(token)' \n" + 
		"requests: \n" + 
    `  - url: '${getRequestUrl}'\n` + 
    "    method: get";

		fileHandler.addFileExtensionIfNone = jest.fn(file => file);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.readFileSync = jest.fn(file => {
			if(file == fileName){
				return harpiYml;
			}
			return undefined;
		});
		fileHandler.saveNewSession = jest.fn();

		var requests = [];
		axios.mockImplementation(options => {
			requests.push(options);
		}); 

		await run(fileName, requestId, verbose, variables, outfile, bail);

		const expHeaderVal = "Bearer " + expValue;
		const actHeaderVal = requests[0].headers["Authorization"];
		expect(actHeaderVal)
		.toEqual(expHeaderVal);
	});

    it("Should use filehandler to save log file", async () => {
		const fileWithFileExtension = "test.harpi.yml";
		const mockAddFileExtCall = jest.fn(file => fileWithFileExtension);
		fileHandler.addFileExtensionIfNone = mockAddFileExtCall;
        const harpiYmlFile = "testfile";
		fileHandler.findHarpiYmlFile = jest.fn(file => harpiYmlFile);
		fileHandler.readFileSync = jest.fn(file => {
			if(file == harpiYmlFile){
				return harpiYml;
			}
		});
		fileHandler.writeLogFileSync = jest.fn();

        const requestId = undefined;
        const verbose = true;
        const variables = "val";
        const outputFile = "logfile"; 

      	await run(harpiYmlFile, requestId, verbose, variables, outputFile);

		expect(fileHandler.writeLogFileSync).toHaveBeenCalledTimes(1);
		expect(fileHandler.writeLogFileSync.mock.calls[0][0]).toEqual(outputFile);
	});

    it("Should use filehandler to get harpi yml file", async () => {

		const fileWithFileExtension = "test.harpi.yml";
		fileHandler.addFileExtensionIfNone = jest.fn(file => fileWithFileExtension) ;
		fileHandler.findHarpiYmlFile = jest.fn();
        const harpiYmlFile = "testfile";
        const requestId = undefined;
        const verbose = false;
        const variables = "val";
        const outputFile = undefined; 

      	await run(harpiYmlFile, requestId, verbose, variables, outputFile);

		expect(fileHandler.addFileExtensionIfNone).toHaveBeenCalledTimes(1);
		expect(fileHandler.addFileExtensionIfNone).toHaveBeenCalledWith(harpiYmlFile);

		expect(fileHandler.findHarpiYmlFile).toHaveBeenCalledTimes(1);
		expect(fileHandler.findHarpiYmlFile).toHaveBeenCalledWith(fileWithFileExtension);
	});

});
