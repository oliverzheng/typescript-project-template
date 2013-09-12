var path = require('path');
var fs = require('fs');
var jake = require('jake');

var SRC_DIR = 'src';
var LIB_DIR = 'lib';
var TSC = 'node_modules/.bin/tsc';
var TSD = 'node_modules/.bin/tsd';
var RED_COLOR = '\033[31m';
var RESET_COLOR = '\033[0m';

var package = require('./package.json');
if (package.dependencies) {
	var deps = Object.keys(package.dependencies);
} else {
	var deps = [];
}

function touch(path) {
	var now = parseInt(Date.now() / 1000, 10);
	fs.utimesSync(path, now, now);
}

desc('Node module dependencies');
file('node_modules', ['package.json'], {async: true}, function() {
	process.stdout.write('Npm installing... ');
	var cmd = 'npm install ' + deps.join(' ');
	var ex = jake.createExec(cmd);
	ex.addListener('error', function(msg) {
		console.log(RED_COLOR + 'Failed.' + RESET_COLOR);
		console.log(msg);
		fail('NPM install failed');
	});
	var target = this.fullName;
	ex.addListener('cmdEnd', function() {
		console.log('Done.');
		touch(target);
		complete();
	});
	ex.run();
})

directory('d.ts');

desc('Download TypeScript definitions');
file('d.ts/typings.d.ts', ['package.json', 'd.ts'], {async: true}, function() {
	process.stdout.write('Downloading TypeScript definitions... ');
	var cmd = TSD + ' install ' + deps.join(' ');
	var ex = jake.createExec(cmd);
	ex.addListener('error', function(msg) {
		console.log(RED_COLOR + 'Failed.' + RESET_COLOR);
		console.log(msg);
		fail('Download definitions failed');
	});
	var fullName = this.fullName;
	ex.addListener('cmdEnd', function() {
		try {
			var dts = jake.readdirR('d.ts').filter(function(filename) {
				return filename.match(/.d.ts$/) && filename != fullName;
			});
		} catch(e) {
			var dts = [];
		}
		fs.writeFile(fullName, dts.map(function(def) {
			return '/// <reference path="../' + def + '" />';
		}).join('\n'), function (err) {
			if (err) {
				console.log(err);
				fail('Definitions failed to write');
			} else {
				console.log('Done.');
				complete();
			}
		});
	});
	ex.run();
});

try {
	var tsFiles = jake.readdirR(SRC_DIR).filter(function(filename) {
		return filename.match(/.ts$/);
	});
} catch(e) {
	var tsFiles = [];
}
var srcFiles = tsFiles.slice(0);
srcFiles.unshift('d.ts/typings.d.ts');

desc('Compile source files.');
file('lib', srcFiles, {async: true}, function() {
	if (tsFiles.length === 0) {
		fail('No source files');
	}
	process.stdout.write('Compiling... ');
	var cmd = TSC + ' --module commonjs --outDir ' + LIB_DIR + ' ' + tsFiles.join(' ');
	var ex = jake.createExec(cmd);
	ex.addListener('error', function(msg) {
		console.log(RED_COLOR + 'Failed.' + RESET_COLOR);
		console.log(msg);
		fail('Compilation failed');
	});
	ex.addListener('cmdEnd', function() {
		console.log('Done.');
		touch('lib');
		complete();
	});
	ex.run();
});

desc('Build project.');
task('build', ['node_modules', 'lib']);

deleteFolderRecursive = function(path) {
	var files = [];
	if (fs.existsSync(path)) {
		files = fs.readdirSync(path);
		files.forEach(function(file,index){
			var curPath = path + "/" + file;
			if(fs.statSync(curPath).isDirectory()) {
				deleteFolderRecursive(curPath);
			} else {
				fs.unlinkSync(curPath);
			}
		});
		fs.rmdirSync(path);
	}
};

task('clean', function() {
	console.log('Removing TypeScript definitions...');
	deleteFolderRecursive('d.ts');
	console.log('Removing compilation...');
	deleteFolderRecursive('lib');
	console.log('Removing binary...');
	deleteFolderRecursive('bin');
});

task('superclean', ['clean'], function() {
	console.log('Removing node modules...');
	deleteFolderRecursive('node_modules');
});

task('default', ['build']);
