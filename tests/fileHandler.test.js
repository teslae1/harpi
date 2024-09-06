const fs = require('fs');
const jsYml = require('js-yaml');
const joinPathSegments = require('path').join;
const fileHandler = require('../fileHandler');


jest.mock('fs');

describe('fileHandler.js', () =>{
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('writeFileSync tests', () => {
    	it("Appends file ext if none", async () => {
			const path = "somepath";
			const content = "somecontent";
			writtenFile = {};
			fs.writeFileSync = jest.fn((path, content) => {
				writtenFile = {path: path, content: content}
				});

			fileHandler.writeFileSync(path, content);
			expect(writtenFile.path).toBe(path);
			expect(writtenFile.content).toBe(content);
			});

		});

	describe('addFileExtensionIfNone tests', () => {
    	it("Appends file ext if none", async () => {
			var fileWithoutExt = "test";
			expect(fileHandler.addFileExtensionIfNone(fileWithoutExt))
			.toBe(fileWithoutExt + ".harpi.yml");
		});
	})

	describe('findHarpiYmlFile tests', () => {
    	it("Searches only immediate dir for file", async () => {
			const fileMatch = "test.harpi.yml";
			const fileNameToSearch = "test.harpi.yml";
			const dirInCurrentDir = "nested";

			const currentDirItems = [dirInCurrentDir, fileMatch];
    		const currentDir = process.cwd();
			fs.readdirSync = jest.fn(dir => {
				if(dir == currentDir){
					return currentDirItems;
				}
			throw "Unexpected value during call of readdirSync";
			});

			fs.statSync = jest.fn(path => {
				if(path == joinPathSegments(currentDir, dirInCurrentDir)){
					return {
						isDirectory: function()  {return true;}
					};
				}
				else{
					return {
						isDirectory: function() {return false;}
					}
				}
			});

			const actFileMatch = fileHandler.findHarpiYmlFile(fileNameToSearch);

			const expTotalFilePath = joinPathSegments(currentDir, fileMatch);
			expect(actFileMatch)
			.toBe(expTotalFilePath);
		});
	});

	describe("Save log file tests", () => {
		it("Saves file at expected path", () => {
			var file = "logfile";
			var content = "content";
			var expPath = joinPathSegments(process.cwd(), file);
			var writtenFiles = [];
			fs.writeFileSync = jest.fn(
				(path, content) => writtenFiles.push({path: path, content: content}));

			fileHandler.writeLogFileSync(file, content);

			expect(writtenFiles)
			.toContainEqual({
				path: expPath,
				content: content
			});
		});
	});

	describe('saveNewSession tests', () => {

		it("Creates new file structure if none", () => {
			var dynamicVariables = [];
			var dir = joinPathSegments("C:","App");
			var fileName = joinPathSegments(dir, "test.harpi.yml");
			var expContent = "harpiconfig/";

			fs.existsSync = jest.fn(any => false);
			var filesCreated = [];
			fs.writeFileSync = jest.fn(
				(path, content) => filesCreated.push({
					path: path,
					content: content
				}));

			var dirsCreated = [];
			fs.mkdirSync = jest.fn(dir => dirsCreated.push(dir));

			fileHandler.saveNewSession(dynamicVariables, dir, fileName);

			expDir = joinPathSegments(dir, "harpiconfig");
			expect(dirsCreated)
			.toContainEqual(expDir);
		});

		it("Saves new session file", () => {

			var dynamicVariables = {key: "val"};
			var expSessionContent = jsYml.dump(dynamicVariables);
			var dir = "C:/App";
			var fileName = "test.harpi.yml";
			var harpiDirName = "harpiconfig";
			expSessionFilePath = joinPathSegments(dir, harpiDirName, "session." + fileName);

			var writtenFiles = [];

			fs.writeFileSync = jest.fn((path, content) => 
			writtenFiles.push({path: path, content: content}));

			fileHandler.saveNewSession(dynamicVariables, dir, fileName);

			expect(writtenFiles)
			.toContainEqual({
				path: expSessionFilePath,
				content: expSessionContent
			})

		});
	});


});

