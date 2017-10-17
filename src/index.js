"use strict";

var process = require("child_process");
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge)
{
	Accessory = homebridge.platformAccessory;
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform("homebridge-clue", "clue", CluePlatform, true);
};

function CluePlatform(log, config, api)
{
	this.log = log;
	this.config = config || { "platform": "clue" };
	this.devices = this.config.devices || [];

	this.serialnumber = this.runCmd("/opt/clue/bin/setup -g raspberry -s");
	this.modelnumber = this.runCmd("/opt/clue/bin/setup -g raspberry -m");

	this.accessories = {};
	this.polling = {};

	this.setMCPiConfig();
	this.setPiCamConfig();
	this.setCecConfig();
	this.setRPiSensorConfig();

	if (api)
	{
		this.api = api;
		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
}

/**
 * Add MCPi (software) accessory
 */
CluePlatform.prototype.setMCPiConfig = function ()
{
	if(this.config.mcpi == true)
	{
		var name = "MCPi";
		var service = this.runCmd('/opt/clue/bin/setup -g service -b mcpi');

		if (service != "")
		{
			this.devices[this.devices.length] =
			{
				"name": name,
				"type": "Switch",
				"on_cmd": "/opt/clue/bin/setup -s service -on mcpi",
				"off_cmd": "/opt/clue/bin/setup -s service -off mcpi",
				"state_cmd": "/opt/clue/bin/setup -g service -e mcpi",
				"state_on": "running",
				"workflow": ["sleep 10", "/opt/clue/bin/setup -s mcpi -p party", "sleep 10", "/opt/clue/bin/setup -s mcpi -s home"],
				"polling": true,
				"interval": 60,
				"manufacturer": "AMSD",
				"model": "hap-clue-" + name.toLowerCase(),
				"serial": name.toUpperCase() + this.serialnumber.substring(name.length)
			};

			if(this.config.mcpi_workflow) this.devices[this.devices.length - 1].workflow = this.config.mcpi_workflow;
		}
	}
};

/**
 * Set <code>PiCam</code> accessory configuration
 */
CluePlatform.prototype.setPiCamConfig = function ()
{
	if (this.config.picam == true)
	{
		var name = "PiCam";
		var service = this.runCmd('/opt/clue/bin/setup -g service -b picam');

		if (service != "")
		{
			this.devices[this.devices.length] =
			{
				"name": name,
				"type": "Switch",
				"on_cmd": "/opt/clue/bin/setup -s service -on picam",
				"off_cmd": "/opt/clue/bin/setup -s service -off picam",
				"state_cmd": "/opt/clue/bin/setup -g service -e picam",
				"state_on": "running",
				"polling": true,
				"interval": 60,
				"manufacturer": "AMSD",
				"model": "hap-clue-" + name.toLowerCase(),
				"serial": name.toUpperCase() + this.serialnumber.substring(name.length)
			};

			if(this.config.picam_workflow) this.devices[this.devices.length - 1].workflow = this.config.picam_workflow;

			var cameras = this.runCmd('/opt/clue/bin/picam -s list').split(" ");

			for (var i in cameras)
			{
				var identifier = "Cam" + cameras[i];

				this.devices[this.devices.length] =
				{
					"name": "Cam" + cameras[i],
					"link": name,
					"type": "Switch",
					"on_cmd": "/opt/clue/bin/picam -c 'start service on #" + cameras[i] + "'",
					"off_cmd": "/opt/clue/bin/picam -c 'stop service on #" + cameras[i] + "'",
					"state_cmd": "/opt/clue/bin/picam -s CameraStatus@" + cameras[i] ,
					"state_on": "on",
					"state_off": "off",
					"polling": true,
					"interval": 60,
					"manufacturer": "AMSD",
					"model": "hap-clue-cam",
					"serial": identifier.toUpperCase() + this.serialnumber.substring(identifier.length)
				};
			}
		}
	}
};

/**
 * Set <code>Cec</code> accessories configuration
 */
CluePlatform.prototype.setCecConfig = function ()
{
	if (this.config.cec == true)
	{
		var devices = JSON.parse(this.runCmd('/opt/clue/bin/setup -g cec -s json')).devices;

		for (var i in devices)
		{
			var id = devices[i].id;
			var ver = devices[i].properties.version;
			var name = devices[i].properties.name;
			var type = devices[i].properties.type;

			if(this.indexOfDeviceConfig(name) < 0 && type.toLowerCase() != "audio" && name.toLowerCase() != "clue" && ver != "unknown" && ver > "1.3")
			{
				var identifier = "CEC" + id;

				this.devices[this.devices.length] =
				{
					"name": name,
					"type": "Switch",
					"on_cmd": "/opt/clue/bin/setup -s cec -on " + id ,
					"off_cmd": "/opt/clue/bin/setup -s cec -off " + id,
					"state_cmd": "/opt/clue/bin/setup -g cec -i power " + id,
					"state_on": "on",
					"state_off": "standby",
					"polling": true,
					"interval": (60 + i*5),
					"manufacturer": "AMSD",
					"model": "hap-clue-cec",
					"serial": identifier.toUpperCase() + this.serialnumber.substring(identifier.length)
				};
			}
		}
	}
};

/**
 * Set <code>RPiSensor</code> accessory configuration
 */
CluePlatform.prototype.setRPiSensorConfig = function ()
{
	if (this.config.rpi == true)
	{
		var name = "RPiSensor";
		this.devices[this.devices.length] =
		{
			"name": name,
			"type": "TemperatureSensor",
			"state_cmd": "/opt/clue/bin/setup -g raspberry -t",
			"state_sync": true,
			"polling": true,
			"interval": 60,
			"min_value": -35,
			"max_value": 120,
			"manufacturer": "element14",
			"serial": this.serialnumber,
			"model": this.modelnumber
		};
	}
};

/**
 * Returns the index of the accessory device from the device list.
 *
 * @param name name of the accessory to find
 * @returns {number} index number from the device configuration list
 */
CluePlatform.prototype.indexOfDeviceConfig = function (name)
{
	if( name != null)
	{
		var index = 0;
		var found = false;

		while (index < this.devices.length && !found)
		{
			found = (name == this.devices[index].name);
			index++;
		}
	}

	if(found) return index - 1;
		else return -1;
};

/**
 * Runs synchronous an operating system command.
 *
 * @param cmd command to be executed
 * @returns {string} the output of the execution
 */
CluePlatform.prototype.runCmd = function (cmd)
{
	try
	{
		var output = process.execSync(cmd).toString().trim();
		this.log.debug('Running [%s] external command: %s', cmd, output);

		return output;
	}
	catch(err)
	{
		this.log.error('Error running [%s] external command: %s', cmd, err.toString());
		return null;
	}
};

/**
 * Method to restore accessories from cache.
 *
 * @param accessory accessory instance
 */
CluePlatform.prototype.configureAccessory = function (accessory)
{
	this.setService(accessory, accessory.context);
	this.accessories[accessory.context.name] = accessory;
};

/**
 * Method to setup accessories from config.json or defined built-in.
 */
CluePlatform.prototype.didFinishLaunching = function ()
{
	// Add or update accessories defined in config.json
	for (var i in this.devices)
	{
		this.addAccessory(this.devices[i]);
	}

	// Remove extra accessories in cache
	for (var name in this.accessories)
	{
		var accessory = this.accessories[name];

		if (!accessory.reachable)
		{
			this.removeAccessory(accessory);
		}
	}
};

CluePlatform.prototype.correlate = function (name, state)
{
	if(!name)
	{
		this.log.warn("Services correlation can not run because no accessory/service name is not specified");
		return;
	}

	for (var index in this.accessories)
	{
		var accessory = this.accessories[index];

		if (accessory.context.name != name)
		{
			if (accessory.context.link && accessory.context.link == name)
			{
				if (state) this.addService(accessory);
					else this.removeService(accessory);
			}
		}
	}
};

/**
 * Method to add and update HomeKit accessories.
 *
 * @param data configuration data structure
 */
CluePlatform.prototype.addAccessory = function (data)
{
	if (!data.type) data.type = "Switch";
	this.log.info("Initializing %s accessory as %s device type..", data.name, data.type);

	// retrieve accessory from cache
	var accessory = this.accessories[data.name];

	// check if the accessory already exist
	if (!accessory)
	{
		// setup new accessory
		var uuid = UUIDGen.generate(data.name);
		accessory = new Accessory(data.name, uuid, 8);

		// setup new accessory service type
		var service = Service[data.type];

		// if the accessory service type is not recognized, stop the process
		if (!service)
		{
			this.log.warn("Unknown accessory service type: %s", data.type);
			return;
		}

		// add the service to the accessory
		accessory.addService(service, data.name);

		// new accessory is always reachable
		accessory.reachable = true;

		// setup listeners for different accessory events
		this.setService(accessory, data);

		// register new accessory in HomeKit
		this.api.registerPlatformAccessories("homebridge-clue", "clue", [accessory]);

		// store accessory in cache
		this.accessories[data.name] = accessory;
	}

	// confirm variable type
	data.polling = data.polling === true;
	data.interval = parseInt(data.interval, 10) || 1;
	if (data.manufacturer) data.manufacturer = data.manufacturer.toString();
	if (data.model) data.model = data.model.toString();
	if (data.serial) data.serial = data.serial.toString();
	if (data.min_value) data.min_value = parseInt(data.min_value, 10) || 0;
	if (data.max_value) data.max_value = parseInt(data.max_value, 10) || 100;

	// store and initialize variables into context
	var cache = accessory.context;
	cache.name = data.name;
	cache.type = data.type;
	if (data.link) cache.link = data.link;
	if (data.on_cmd) cache.on_cmd = data.on_cmd;
	if (data.off_cmd) cache.off_cmd = data.off_cmd;
	if (data.state_cmd) cache.state_cmd = data.state_cmd;
	if (data.state_on) cache.state_on = data.state_on;
	if (data.state_off) cache.state_off = data.state_off;
	if (data.state_eval) cache.state_eval = data.state_eval;
	if (data.state_sync) cache.state_sync = data.state_sync;
	if (data.workflow) cache.workflow = data.workflow;
	cache.polling = data.polling;
	cache.interval = data.interval;
	cache.manufacturer = data.manufacturer;
	cache.model = data.model;
	cache.serial = data.serial;
	if (data.min_value) cache.min_value = data.min_value;
	if (data.max_value) cache.max_value = data.max_value;

	//initiative state
	if (cache.state === undefined) cache.state = this.getDirectState(data);

	// retrieve initial state
	this.getInitState(accessory);

	// configure state polling
	if (data.polling && data.state_cmd)
	{
		this.statePolling(data.name);
	}

	// if the linked/parent service exists run correlation process
	if (data.link)
	{
		var parent = this.accessories[data.link];

		if(parent) this.correlate(parent.context.name, parent.context.state);
	}
};

/**
 * Method to remove accessories from HomeKit.
 *
 * @param accessory accessory instance
 */
CluePlatform.prototype.removeAccessory = function (accessory)
{
	if (accessory)
	{
		var name = accessory.context.name;

		clearTimeout(this.polling[name]);
		delete this.polling[name];

		this.api.unregisterPlatformAccessories("homebridge-clue", "clue", [accessory]);
		delete this.accessories[name];

		this.log.info("%s accessory has been removed from HomeBridge", name);
	}
};

/**
 * Method to run accessory workflow after when is created and when is becoming on.
 *
 * @param name accessory name
 */
CluePlatform.prototype.execWorkflow = function (name)
{
	if(!name)
	{
		this.log.warn("Workflow can not be started because accessory/service name is not specified");
		return;
	}

	var self = this;
	var accessory = this.accessories[name];

	if(accessory && accessory.context.workflow && accessory.context.state)
	{
		setTimeout(function()
		{
			for (var index in accessory.context.workflow)
			{
				try
				{
					self.runCmd(accessory.context.workflow[index]);
				}
				catch(err)
				{
					self.log.error("Error running operation command for %s accessory service: %s", accessory.context.name, err.message);
				}
			}
		}, 1000);
	}
};

/**
 * Method to add a service to an existing accessories.
 *
 * @param accessory accessory instance
 */
CluePlatform.prototype.addService = function (accessory)
{
	if (accessory)
	{
		var data = accessory.context;
		var service = accessory.getService(data.name);

		// check if the service already exists
		if(!service)
		{
			// create a new service type specified through the configuration
			service = Service[data.type];

			// if the accessory service type is not recognized, stop the process
			if (!service)
			{
				this.log.warn("Unknown accessory service type: %s", data.type);
				return;
			}

			// add the service to the accessory
			accessory.addService(service, data.name);

			// the accessory should be reachable
			accessory.reachable = true;

			// setup listeners for different accessory events
			this.setService(accessory, data);

			//get current state
			data.state = this.getDirectState(data);

			// retrieve initial state
			this.getInitState(accessory);

			// configure state polling
			if (data.polling && data.state_cmd)
			{
				this.statePolling(data.name);
			}

			this.log.info("%s accessory service has been created into accessory instance", data.name);

			// check workflow have to be executed
			this.execWorkflow(data.name);

			// ask HomeKit for update
			accessory.updateReachability(true);
			this.api.updatePlatformAccessories([accessory]);
		}
	}
};

/**
 * Method to remove services attached to an accessory.
 *
 * @param accessory accessory instance
 */
CluePlatform.prototype.removeService = function (accessory)
{
	if (accessory)
	{
		var name = accessory.context.name;
		var service = accessory.getService(Service[accessory.context.type]);

		if(service)
		{
			clearTimeout(this.polling[name]);
			delete this.polling[name];

			accessory.removeService(service);

			this.log.info("%s accessory service has been removed from accessory instance", name);

			// ask HomeKit for update
			accessory.updateReachability(false);
			this.api.updatePlatformAccessories([accessory]);
		}
	}
};

CluePlatform.prototype.getTextState = function (state)
{
	return state ? "On" : "Off";
};

/**
 * Method to setup listeners for different events.
 *
 * @param accessory accessory instance
 * @param data configuration data structure
 */
CluePlatform.prototype.setService = function (accessory, data)
{
	var service = accessory.getService(Service[data.type]);

	if (!service)
	{
		this.log.warn("%s service not found as a %s type to define service listeners..", data.name, data.type);
	}
	else
	{
		switch (data.type)
		{
			case "Switch":
				service.getCharacteristic(Characteristic.On)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				break;
			case "Outlet":
				service.getCharacteristic(Characteristic.On)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				break;
			case "Lightbulb":
				service.getCharacteristic(Characteristic.On)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				break;
			case "Door":
				service.getCharacteristic(Characteristic.LockCurrentState)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				service.getCharacteristic(Characteristic.LockTargetState)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				break;
			case "LockMechanism":
				service.getCharacteristic(Characteristic.CurrentDoorState)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				service.getCharacteristic(Characteristic.TargetDoorState)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				break;
			case "WindowCovering":
				service.getCharacteristic(Characteristic.CurrentPosition)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				service.getCharacteristic(Characteristic.TargetPosition)
					.on('get', this.getControlState.bind(this, accessory.context))
					.on('set', this.setCallbackState.bind(this, accessory.context));
				break;
			case "TemperatureSensor":
				service.getCharacteristic(Characteristic.CurrentTemperature)
					.on('get', this.getControlValue.bind(this, accessory.context));
				service.getCharacteristic(Characteristic.CurrentTemperature)
					.setProps({minValue:data.min_value, maxValue:data.max_value});
				break;
		}
	}

	accessory.on('identify', this.identify.bind(this, accessory.context));
};

/**
 * Method to retrieve initial state.
 *
 * @param accessory accessory instance
 */
CluePlatform.prototype.getInitState = function (accessory)
{
	// Update HomeKit accessory information
	accessory.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, accessory.context.manufacturer || "N/A")
		.setCharacteristic(Characteristic.Model, accessory.context.model || "n/a")
		.setCharacteristic(Characteristic.SerialNumber, accessory.context.serial || "000000000000");

	// Retrieve initial state if polling is disabled
	if (!accessory.context.polling)
	{
		switch (accessory.context.type)
		{
			case "Switch":
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.On).getValue();
				break;
			case "Outlet":
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.On).getValue();
				break;
			case "Lightbulb":
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.On).getValue();
				break;
			case "Door":
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.LockCurrentState).getValue();
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.LockTargetState).getValue();
				break;
			case "LockMechanism":
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.CurrentDoorState).getValue();
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.TargetDoorState).getValue();
				break;
			case "WindowCovering":
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.CurrentPosition).getValue();
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.TargetPosition).getValue();
				break;
			case "TemperatureSensor":
				accessory.getService(Service[accessory.context.type]).getCharacteristic(Characteristic.CurrentTemperature).getValue();
				break;
		}
	}

	// Configured accessory is reachable
	accessory.updateReachability(true);
};

 CluePlatform.prototype.getSwitchEvaluation = function (data, error, stdout)
{
	var input = stdout != null ? stdout.toString().trim().toLowerCase() : null;
	var output = null;

	if (data.state_on)
	{
		var onarray = data.state_on.toLowerCase().split(",");
		var index = onarray.indexOf(input);

		if(index < 0)
		{
			if(data.state_off)
			{
				var offarray = data.state_off.toLowerCase().split(",");
				index = offarray.indexOf(input);

				if(index >= 0) output = false;
					else output = data.state;
			}
			else output = false;
		}
		else output = true;
	}
	else if (data.state_eval)
	{
		output = eval(data.state_eval);
	}
	else if( error != null)
	{
		output = !error;
	}
	else
	{
		output = input != null;
	}

	return output;
};

CluePlatform.prototype.getSwitchExtendedEvaluation = function (data, error, stdout, onval, offval)
{
	var output = this.getSwitchEvaluation(data, error, stdout);

	if(output) return onval;
		else return offval;
};

CluePlatform.prototype.getDataEvaluation = function (data, type, error, stdout)
{
	var input = stdout != null ? stdout.toString().trim().toLowerCase() : null;
	var output = null;

	if(error != null)
	{
		output = error;
	}
	else if (data.state_eval)
	{
		output = eval(data.state_eval);
	}
	else
	{
		output = input;
	}

	if(type == null || type == 'string') return output.toString();
		else if (type == 'int')  return parseInt(output);
			else if (type == 'float')  return parseFloat(output);
				else return output;
};

/**
 * Runs synchronous an operating system command.
 *
 * @param data specific data related to a specific accessory
 * @returns {string} the output of the execution
 */
CluePlatform.prototype.getDirectState = function (data)
{
	var output = null;
	var stdout = null;

	stdout = process.execSync(data.state_cmd).toString().trim();
	this.log.debug('Getting the state, %s returned the following output of [%s] external command from Direct call: %s', data.name, data.state_cmd, stdout != null ? stdout.toString().trim() : null);

	switch (data.type)
	{
		case "Switch":
			output = this.getSwitchEvaluation(data, null, stdout);
			break;
		case "Outlet":
			output = this.getSwitchEvaluation(data, null, stdout);
			break;
		case "Lightbulb":
			output = this.getSwitchEvaluation(data, null, stdout);
			break;
		case "Door":
			output = this.getSwitchExtendedEvaluation(data, null, stdout, Characteristic.LockCurrentState.CLOSED, Characteristic.LockCurrentState.OPEN);
			break;
		case "LockMechanism":
			output = this.getSwitchExtendedEvaluation(data, null, stdout, Characteristic.LockCurrentState.SECURED, Characteristic.LockCurrentState.UNSECURED);
			break;
		case "WindowCovering":
			output = this.getSwitchExtendedEvaluation(data, null, stdout, 100, 0);
			break;
		case "TemperatureSensor":
			output = this.getDataEvaluation(data, "float", null, stdout);
			break;
	}

	this.log.debug('%s is running using state value from direct call: %s', data.name, output != null ? output.toString() : null);
	return output;
};

/**
 * Method to determine current state.
 *
 * @param data specific data related to a specific accessory
 * @param callback callback method
 */
CluePlatform.prototype.getCallbackState = function (data, callback)
{
	this.log.debug('%s is preparing to get status, calling [%s] external command..', data.name, data.state_sync != null ? "synchronous" : "asynchronous");

	if (data.state_sync)
	{
		// Execute command synchronous to get state valuer
		var state = this.getDirectState(data);

		callback(null, state);
	}
	else
	{
		var self = this;

		// Execute command asynchronous to detect state
		process.exec(data.state_cmd, function (error, stdout, stderr)
		{
			var output = null;
			self.log.debug('Getting the state, %s returned the following output of [%s] external command from Callback call: %s', data.name, data.state_cmd, stdout != null ? stdout.toString().trim() : null);

			switch (data.type)
			{
				case "Switch":
					output = self.getSwitchEvaluation(data, error, stdout);
					break;
				case "Outlet":
					output = self.getSwitchEvaluation(data, error, stdout);
					break;
				case "Lightbulb":
					output = self.getSwitchEvaluation(data, error, stdout);
					break;
				case "Door":
					output = self.getSwitchExtendedEvaluation(data, error, stdout, Characteristic.LockCurrentState.CLOSED, Characteristic.LockCurrentState.OPEN);
					break;
				case "LockMechanism":
					output = self.getSwitchExtendedEvaluation(data, error, stdout, Characteristic.LockCurrentState.SECURED, Characteristic.LockCurrentState.UNSECURED);
					break;
				case "WindowCovering":
					output = self.getSwitchExtendedEvaluation(data, error, stdout, 100, 0);
					break;
				case "TemperatureSensor":
					output = self.getDataEvaluation(data, "float", error, stdout);
					break;
			}

			// Error detection
			if (stderr)
			{
				self.log.error("Failed to determine %s output/value; %s", data.name, stderr.toString());
			}

			self.log.debug('%s is running the callback using found state value: %s', data.name, output != null ? output.toString() : null);
			callback(stderr, output);
		});
	}
};

/**
 * Method to determine current state.
 *
 * @param name name of the accessory
 */
CluePlatform.prototype.statePolling = function (name)
{
	var accessory = this.accessories[name];
	var service = accessory.getService(Service[accessory.context.type]);
	var data = accessory.context;
	var self = this;

	// Clear polling
	clearTimeout(this.polling[name]);

	this.getCallbackState(data, function (error, state)
	{
		// Update state if there's no error
		if (!error && state !== data.state)
		{
			data.state = state;

			if (service)
			{
				switch (data.type)
				{
					case "Switch":
						service.getCharacteristic(Characteristic.On).getValue();
						break;
					case "Outlet":
						service.getCharacteristic(Characteristic.On).getValue();
						break;
					case "Lightbulb":
						service.getCharacteristic(Characteristic.On).getValue();
						break;
					case "Door":
						service.getCharacteristic(Characteristic.LockCurrentState).getValue();
						service.getCharacteristic(Characteristic.LockTargetState).getValue();
						break;
					case "LockMechanism":
						service.getCharacteristic(Characteristic.CurrentDoorState).getValue();
						service.getCharacteristic(Characteristic.TargetDoorState).getValue();
						break;
					case "WindowCovering":
						service.getCharacteristic(Characteristic.CurrentPosition).getValue();
						service.getCharacteristic(Characteristic.TargetPosition).getValue();
						break;
					case "TemperatureSensor":
						service.getCharacteristic(Characteristic.CurrentTemperature).getValue();
						break;
				}
			}
		}
	});

	// Setup for next polling if the service still exist
	if(service)
	{
		this.polling[name] = setTimeout(this.statePolling.bind(this, name), data.interval * 1000);
	}
};

/**
 * Method to determine current value.
 *
 * @param data
 * @param callback
 */
CluePlatform.prototype.getControlValue = function (data, callback)
{
	var self = this;

	if (data.polling)
	{
		// Get state directly from cache if polling is enabled
		this.log.debug("%s has currently the value %s", data.name, data.state);

		callback(null, data.state);
	}
	else
	{
		// Check state if polling is disabled
		this.getCallbackState(data, function (error, state)
		{
			// Update state if command exists
			if (data.state_cmd) data.state = state;
			if (!error) self.log("%s has value %s", data.name, data.state);

			callback(error, data.state);
		});
	}
};

/**
 * Method to determine current state.
 *
 * @param data
 * @param callback
 */
CluePlatform.prototype.getControlState = function (data, callback)
{
	var self = this;

	if (data.polling)
	{
		// Get state directly from cache if polling is enabled
		this.log.debug("%s is currently %s", data.name, this.getTextState(data.state));

		callback(null, data.state);
	}
	else
	{
		// Check state if polling is disabled
		this.getCallbackState(data, function (error, state)
		{
			// Update state if command exists
			if (data.state_cmd) data.state = state;
			if (!error) self.log.info("%s is turned %s", data.name, self.getTextState(data.state));

			callback(error, data.state);
		});
	}
};

/**
 * Method to set state.
 *
 * @param data
 * @param state
 * @param callback
 */
CluePlatform.prototype.setCallbackState = function (data, state, callback)
{
	var cmd = null;
	var tout = null;
	var self = this;

	if(data.on_cmd && data.off_cmd) cmd = state ? data.on_cmd : data.off_cmd;
		else if(data.on_cmd && !data.off_cmd) cmd = data.on_cmd;
			else if(!data.on_cmd && data.off_cmd) cmd = data.off_cmd;

	// Execute command to set state
	process.exec(cmd, function (error, stdout, stderr)
	{
		self.log.debug('Setting the state, %s returned the following output of [%s] external command from Callback call: %s', data.name, cmd, stdout != null ? stdout.toString().trim() : null);

		// Error detection
		if (error && (state !== data.state))
		{
			self.log.error("%s is not turning %s due to the following error: %s", data.name, self.getTextState(state), stderr.toString());
		}
		else
		{
			if (cmd) self.log.info("%s is turning %s", data.name, self.getTextState(state));

			data.state = state;
			error = null;
		}

		if (tout)
		{
			clearTimeout(tout);
			callback(error);
		}

		//correlation between current service accessory and child services
		self.correlate(data.name, state);

		// check workflow that have to be executed
		self.execWorkflow(data.name);
	});

	// Allow 1s to set state but otherwise assumes success
	tout = setTimeout(function ()
	{
		tout = null;
		self.log.warn("%s waited too long time for turning %, assuming success", data.name, self.getTextState(state));

		callback();
	}, 5000);
};

// Method to handle identify request
CluePlatform.prototype.identify = function (thisSwitch, paired, callback)
{
	this.log.info(thisSwitch.name + " identify requested!");
	callback();
};

// Method to handle plugin configuration in HomeKit app
CluePlatform.prototype.configurationRequestHandler = function (context, request, callback)
{
	if (request && request.type === "Terminate")
	{
		return;
	}
	// Instruction
	if (!context.step)
	{
		var instructionResp =
		{
			"type": "Interface",
			"interface": "instruction",
			"title": "Before You Start...",
			"detail": "Please make sure HomeBridge is running with elevated privileges.",
			"showNextButton": true
		};

		context.step = 1;
		callback(instructionResp);
	}
	else
	{
		switch (context.step)
		{
			case 1:
				// Operation choices
				var respDict =
				{
					"type": "Interface",
					"interface": "list",
					"title": "What do you want to do?",
					"items": [
						"Add New Accessory",
						"Modify Existing Accessory",
						"Remove Existing Accessory"
					]
				};

				context.step = 2;
				callback(respDict);
				break;
			case 2:
				var selection = request.response.selections[0];

				if (selection === 0)
				{
					// Info for new accessory
					var respDict =
					{
						"type": "Interface",
						"interface": "input",
						"title": "New Accessory",
						"items": [{
							"id": "name",
							"title": "Name (Required)",
							"placeholder": "CLUE"
						}]
					};

					context.operation = 0;
					context.step = 3;
					callback(respDict);
				}
				else
				{
					var names = Object.keys(this.accessories);

					if (names.length > 0)
					{
						// Select existing accessory for modification or removal
						if (selection === 1)
						{
							var title = "Which switch do you want to modify?";
							context.operation = 1;
							context.step = 3;
						}
						else
						{
							var title = "Which switch do you want to remove?";
							context.step = 5;
						}

						var respDict =
						{
							"type": "Interface",
							"interface": "list",
							"title": title,
							"items": names
						};

						context.list = names;
					}
					else
					{
						// Error if not switch is configured
						var respDict =
						{
							"type": "Interface",
							"interface": "instruction",
							"title": "Unavailable",
							"detail": "No switch is configured.",
							"showNextButton": true
						};

						context.step = 1;
					}
					callback(respDict);
				}
				break;
			case 3:
				if (context.operation === 0)
				{
					var data = request.response.inputs;
				}
				else if (context.operation === 1)
				{
					var selection = context.list[request.response.selections[0]];
					var data = this.accessories[selection].context;
				}

				if (data.name)
				{
					// Add/Modify info of selected accessory
					var respDict =
					{
						"type": "Interface",
						"interface": "input",
						"title": data.name,
						"items": [
							{
								"id": "type",
								"title": "Type of Accessory",
								"placeholder": context.operation ? "Leave blank if unchanged" : "Switch"
							},
							{
								"id": "on_cmd",
								"title": "CMD to Turn On",
								"placeholder": context.operation ? "Leave blank if unchanged" : "/opt/clue/setup -s service -on mcpi"
							},
							{
								"id": "off_cmd",
								"title": "CMD to Turn Off",
								"placeholder": context.operation ? "Leave blank if unchanged" : "/opt/clue/setup -s service -off mcpi"
							},
							{
								"id": "state_cmd",
								"title": "CMD to Check ON State",
								"placeholder": context.operation ? "Leave blank if unchanged" : "/opt/clue/setup -g service -b mcpi"
							},
							{
								"id": "workflow",
								"title": "CMDs to Run when ON State",
								"placeholder": context.operation ? "Leave blank if unchanged" : "sleep 5"
							},
							{
								"id": "polling",
								"title": "Enable Polling (true/false)",
								"placeholder": context.operation ? "Leave blank if unchanged" : "false"
							},
							{
								"id": "interval",
								"title": "Polling Interval",
								"placeholder": context.operation ? "Leave blank if unchanged" : "1"
							},
							{
								"id": "min_value",
								"title": "Minimum Value",
								"placeholder": context.operation ? "Leave blank if unchanged" : "0"
							},
							{
								"id": "max_value",
								"title": "Maximum Value",
								"placeholder": context.operation ? "Leave blank if unchanged" : "100"
							},
							{
								"id": "link",
								"title": "Linked Accessory",
								"placeholder": context.operation ? "Leave blank if unchanged" : "N/A"
							},
							{
								"id": "manufacturer",
								"title": "Manufacturer",
								"placeholder": context.operation ? "Leave blank if unchanged" : "N/A"
							},
							{
								"id": "model",
								"title": "Model",
								"placeholder": context.operation ? "Leave blank if unchanged" : "n/a"
							},
							{
								"id": "serial",
								"title": "Serial",
								"placeholder": context.operation ? "Leave blank if unchanged" : "000000000000"
							}
						]
					};

					context.name = data.name;
					context.step = 4;
				}
				else
				{
					// Error if required info is missing
					var respDict =
					{
						"type": "Interface",
						"interface": "instruction",
						"title": "Error",
						"detail": "Name of the switch is missing.",
						"showNextButton": true
					};

					context.step = 1;
				}

				delete context.list;
				delete context.operation;
				callback(respDict);
				break;
			case 4:
				var userInputs = request.response.inputs;
				var newDevice = {};

				// Clone context if switch exists
				if (this.accessories[context.name])
				{
					newDevice = JSON.parse(JSON.stringify(this.accessories[context.name].context));
				}

				// Setup input for addAccessory
				newDevice.name = context.name;
				newDevice.type = context.type;
				newDevice.on_cmd = userInputs.on_cmd || newDevice.on_cmd;
				newDevice.off_cmd = userInputs.off_cmd || newDevice.off_cmd;
				newDevice.state_cmd = userInputs.state_cmd || newDevice.state_cmd;
				if (userInputs.polling.toUpperCase() === "TRUE") newDevice.polling = true;
					else if (userInputs.polling.toUpperCase() === "FALSE") newDevice.polling = false;
				newDevice.interval = userInputs.interval || newDevice.interval;
				newDevice.min_value = userInputs.min_value || newDevice.min_value;
				newDevice.max_value = userInputs.max_value || newDevice.max_value;
				newDevice.link = userInputs.link || newDevice.link;
				newDevice.workflow = userInputs.workflow || newDevice.workflow;
				newDevice.manufacturer = userInputs.manufacturer;
				newDevice.model = userInputs.model;
				newDevice.serial = userInputs.serial;

				// Register or update accessory in HomeKit
				this.addAccessory(newDevice);

				var respDict =
				{
					"type": "Interface",
					"interface": "instruction",
					"title": "Success",
					"detail": "The new switch is now updated.",
					"showNextButton": true
				};

				context.step = 6;
				callback(respDict);
				break;
			case 5:
				// Remove selected accessory from HomeKit
				var selection = context.list[request.response.selections[0]];
				var accessory = this.accessories[selection];

				this.removeAccessory(accessory);
				var respDict =
				{
					"type": "Interface",
					"interface": "instruction",
					"title": "Success",
					"detail": "The accessory is now removed.",
					"showNextButton": true
				};

				delete context.list;
				context.step = 6;
				callback(respDict);
				break;
			case 6:
				// Update config.json accordingly
				var self = this;
				delete context.step;
				var newConfig = this.config;

				// Create config for each switch
				var newSwitches = Object.keys(this.accessories).map(function (k)
				{
					var accessory = self.accessories[k];
					var data =
					{
						'name': accessory.context.name,
						'on_cmd': accessory.context.on_cmd,
						'off_cmd': accessory.context.off_cmd,
						'state_cmd': accessory.context.state_cmd,
						'polling': accessory.context.polling,
						'interval': accessory.context.interval,
						'min_value': accessory.context.min_value,
						'max_value': accessory.context.max_value,
						'link': accessory.context.link,
						'workflow': accessory.context.workflow,
						'manufacturer': accessory.context.manufacturer,
						'model': accessory.context.model,
						'serial': accessory.context.serial,
						'type': accessory.context.type
					};
					return data;
				});

				newConfig.devices = newSwitches;
				callback(null, "platform", true, newConfig);
				break;
		}
	}
};
