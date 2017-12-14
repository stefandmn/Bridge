#!/usr/bin/env node

'use strict';

var fs = require('fs');
var path = require('path');
var proc = require("child_process");
var chalk = require('/opt/node/lib/node_modules/homebridge/node_modules/chalk');
var program = require('/opt/node/lib/node_modules/homebridge/node_modules/commander');


module.exports = function()
{
	new Bridge();
};

function Bridge()
{
	this.jsoncfg = '/opt/clue/etc/bridge.json';
	this.jsonpkg = '/opt/clue/share/bridge/package.json';
	this.libpath = '/opt/node/lib/node_modules/homebridge/lib';
	this.homebridge = null;
}

Bridge.prototype.run = function ()
{
	program
		.version(this.version())
		.option('-c, --config', 'Create configuration file')
		.option('-d, --display', 'Display Clue Bridge PIN for iOS registration')
		.option('-s, --start', 'Start HomeBride server')
		.option('-k, --stop', 'Shutdown/kill process of Bridge service')
		.option('-D, --debug', 'Run HomeBride server in debug mode')
		.parse(process.argv);

	var self = this;
	var signals = { 'SIGINT': 2, 'SIGTERM': 15 };
	Object.keys(signals).forEach(function (signal)
	{
		process.on(signal, function ()
		{
			console.log("\nGot %s, shutting down Clue Bridge...", signal);

			if(self.homebridge)
			{
				self.homebridge.kill();
			}

			process.exit(128 + signals[signal]);
		});
	});

	if(program.stop)
	{
		this.kill();
	}
	else
	{
		if (program.config)
		{
			process.argv.shift();
			this.config();
		}

		if (program.display)
		{
			process.argv.shift();
			this.display();
		}

		if (program.start || program.debug)
		{
			if (program.start) process.argv.shift();
			this.start();
		}
	}
};

Bridge.prototype.version = function ()
{
	return JSON.parse(fs.readFileSync(this.jsonpkg)).version;
};

Bridge.prototype.display = function ()
{
	try
	{
		var config = JSON.parse(fs.readFileSync(this.jsoncfg, 'utf8'));
		var pi = config.bridge.pin;

		console.log("\n");
		console.log(chalk.black.bgWhite("                               "));
		console.log(chalk.black.bgWhite("                               "));
		console.log(chalk.black.bgWhite("        ┌────────────┐         "));
		console.log(chalk.black.bgWhite("        │ " + pi + " │         "));
		console.log(chalk.black.bgWhite("        └────────────┘         "));
		console.log(chalk.black.bgWhite("                               "));
		console.log(chalk.black.bgWhite("                               "));
		console.log("\n");
	}
	catch(err)
	{
		console.log("\nError reading Bridge configuration file: %s\n", err.toString());
	}
};

Bridge.prototype.config = function ()
{
	var serialno = this.exec("/opt/clue/bin/setup -g raspberry -s").toUpperCase().trim();
	var hostname = this.exec("/opt/clue/bin/setup -g hostname").toUpperCase().trim();
	var username = this.exec("/bin/ip link show eth0 | /usr/bin/awk '/ether/ {print $2}'").toUpperCase().trim();
	var reversed = serialno.replace(/\D/g,'').split("").reverse().join("");

	var config =
	{
		"bridge":
		{
			"name": hostname,
			"port": "51826",
			"pin": reversed.substr(0,3) + "-" + reversed.substr(3,2) + "-" + reversed.substr(5,3),
			"username": username,
			"model": "homebridge",
			"manufacturer": "AMSD",
			"serialNumber": serialno
		},

		"description": "Clue Media Experience",

		"platforms": [
			{
				"name": "Clue Platform",
				"platform": "clue",
				"mcpi": true,
				"picam": true,
				"cec": true,
				"rpi": true
			}
		]
	};

	fs.writeFile(this.jsoncfg, JSON.stringify(config, null, 4), 'utf8', function(err)
	{
    	if(err)
		{
        	return console.log(err);
    	}

	});
};

/**
 * Runs synchronous an operating system command.
 *
 * @param cmd command to be executed
 * @returns {string} the output of the execution
 */
Bridge.prototype.exec = function (cmd)
{
	try
	{
		return proc.execSync(cmd).toString().trim();
	}
	catch(err)
	{
		return null;
	}
};

Bridge.prototype.start = function ()
{
	// Run HomeBridge
	this.homebridge = require(this.libpath + '/cli')();
};

Bridge.prototype.kill = function ()
{
	try
	{
		var bridge = this.exec("ps aux | grep 'bridge.js' | grep -v grep | awk '{print $2}'");
		process.kill(parseInt(bridge));
	}
	catch(err)
	{
		console.log("\nError shutting down Clue Bridge server: %s\n", err.toString());
	}
};

var bridge = new Bridge();
bridge.run();
