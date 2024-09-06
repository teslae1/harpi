

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

	it("Should send expected requests", async () => {
		tests = [
			{
				name: "phonenumber +123 should not remove + on jsonbody usage",
				yml: 
				"variables: \n" +
				"  phonenumb: \"+12345678\"\n" + 
				"\n" + 
				"requests:\n" + 
				"  - url: \"https://t.com\"\n" +
				"    method: post\n" +
				"    jsonBody:\n" + 
				"      phonenumb: \"$(phonenumb)\"\n",
				assert: (requests, name) => {
					if(requests.length != 1){
						throw new Error("Expected exactly 1 request: " + name);
					}
					const req = requests[0];
					const data = req.data;
					const phoneNumbVal = data["phonenumb"];
					expect(phoneNumbVal).toEqual("+12345678")
				}
			},
			{
				name: "phonenumber 123 should be removed if jsonbody usage as int(without quote encasing)",
				yml: 
				"variables: \n" +
				"  phonenumb: 12345678\n" + 
				"\n" + 
				"requests:\n" + 
				"  - url: \"https://t.com\"\n" +
				"    method: post\n" +
				"    jsonBody:\n" + 
				"      phonenumb: $(phonenumb)\n",
				assert: (requests, name) => {
					if(requests.length != 1){
						throw new Error("Expected exactly 1 request: " + name);
					}
					const req = requests[0];
					const data = req.data;
					const phoneNumbVal = data["phonenumb"];
					expect(phoneNumbVal).toEqual(12345678)
				}
			},
			{
				name: "int input passed into part of header should not be encased in quotes",
				yml: 
				"variables: \n" +
				"  minute: 1\n" + 
				"\n" + 
				"headers:\n"+
				"  time: \"minute: $(minute)\""+
				  "\n"+
				"requests:\n" + 
				"  - url: \"https://t.com\"\n" +
				"    method: get\n",
				assert: (requests, name) => {
					if(requests.length != 1){
						throw new Error("Expected exactly 1 request: " + name);
					}
					const req = requests[0];
					const headers = req.headers;
					const val = headers["time"];
					expect(val).toEqual('minute: 1');
				}
			},
		]

		fileHandler.addFileExtensionIfNone = jest.fn(file => file);
		fileHandler.findHarpiYmlFile = jest.fn(file => file);
		fileHandler.saveNewSession = jest.fn();

		tests.forEach(async test => {
			const yml = test.yml;
			fileHandler.readFileSync = jest.fn(file => yml);
        	const harpiYmlFile = "testfile";
        	const requestId = undefined;
        	const verbose = false;
        	const variables = "val";
        	const outputFile = undefined; 
			var requests = [];
			axios.mockImplementation(options => {
				requests.push(options);
			}); 

			await run(harpiYmlFile, requestId, verbose,variables,outputFile,null,null,testLogFunction);

			test.assert(requests, test.name);
		});
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

      	let exitCode = await run(harpiYmlFile, requestId, verbose, variables, outputFile, null,null,testLogFunction);

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
			bail,
			null,
			testLogFunction);

		expect(exitCode)
		.toEqual(1);
	});

	it("Should exit non zero when no file found", async () => {
		fileHandler.addFileExtensionIfNone = jest.fn();
		fileHandler.findHarpiYmlFile = jest.fn();

		let exitCode = await run("filename",null,null,null,null,null,null,testLogFunction);

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

		await run(fileName, requestId, verbose, variables, outfile, bail, null,testLogFunction);

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

      	await run(harpiYmlFile, requestId, verbose, variables, outputFile, null,null, testLogFunction);

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

      	await run(harpiYmlFile, requestId, verbose, variables, outputFile, null,null,testLogFunction);

		expect(fileHandler.addFileExtensionIfNone).toHaveBeenCalledTimes(1);
		expect(fileHandler.addFileExtensionIfNone).toHaveBeenCalledWith(harpiYmlFile);

		expect(fileHandler.findHarpiYmlFile).toHaveBeenCalledTimes(1);
		expect(fileHandler.findHarpiYmlFile).toHaveBeenCalledWith(fileWithFileExtension);
	});

});

function testLogFunction(msg){
}
