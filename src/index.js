"use strict";

var pjson = require('./package.json');
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
	this.devices = this.config.devices || {};

	this.serialnumber = this.runCmd("/opt/clue/bin/setup -g raspberry -s");
	this.modelnumber = this.runCmd("/opt/clue/bin/setup -g raspberry -m");

	this.accessories = {};
	this.polling = {};

	this.loadMCPiConfig();
	this.loadPiCamConfig();
	this.loadCecConfig();
	this.loadRPiSensorConfig();

	if (api)
	{
		this.api = api;
		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
}

/**
 * Add MCPi (software) accessory
 */
CluePlatform.prototype.loadMCPiConfig = function ()
{
	if(this.config.mcpi == true && this.runCmd('/opt/clue/bin/setup -g service -b mcpi') != "")
	{
		this.devices.mcpi =
		{
			"name": "MCPi",
			"type": "Switch",
			"on_cmd": "/opt/clue/bin/setup -s service -on mcpi",
			"off_cmd": "/opt/clue/bin/setup -s service -off mcpi",
			"state_cmd": "/opt/clue/bin/setup -g service -e mcpi",
			"state_on": "running",
			"state_flow": ["sleep 10", "/opt/clue/bin/setup -s mcpi -p party", "sleep 10", "/opt/clue/bin/setup -s mcpi -s home"],
			"polling": true,
			"interval": 60,
			"manufacturer": "AMSD",
			"model": "hap-clue-mcpi",
			"serial": "MCPI" + this.serialnumber.substring(4)
		};

		if(this.config.mcpi_state_flow) this.devices.mcpi.state_flow = this.config.mcpi_state_flow;
	}
};

/**
 * Set <code>PiCam</code> accessory configuration
 */
CluePlatform.prototype.loadPiCamConfig = function ()
{
	if (this.config.picam == true && this.runCmd('/opt/clue/bin/setup -g service -b picam') != "")
	{
		this.devices.picam =
		{
			"name": "PiCam",
			"type": "Switch",
			"on_cmd": "/opt/clue/bin/setup -s service -on picam",
			"off_cmd": "/opt/clue/bin/setup -s service -off picam",
			"state_cmd": "/opt/clue/bin/setup -g service -e picam",
			"state_on": "running",
			"polling": true,
			"interval": 60,
			"manufacturer": "AMSD",
			"model": "hap-clue-picam",
			"serial": "PICAM" + this.serialnumber.substring(5)
		};

		if(this.config.picam_state_flow) this.devices.picam.state_flow = this.config.picam_state_flow;

		var cameras = this.runCmd('/opt/clue/bin/picam -s list').split(" ");

		for (var i in cameras)
		{
			var code = ("cam" + cameras[i]).toLowerCase();

			this.devices[code] =
			{
				"name": "Camera " + cameras[i],
				"type": "Switch",
				"on_cmd": "/opt/clue/bin/picam -c 'start service on #" + cameras[i] + "'",
				"off_cmd": "/opt/clue/bin/picam -c 'stop service on #" + cameras[i] + "'",
				"state_cmd": "/opt/clue/bin/picam -s CameraStatus@" + cameras[i] ,
				"state_on": "on",
				"state_off": "off",
				"dependency": "picam",
				"polling": true,
				"interval": 60,
				"manufacturer": "AMSD",
				"model": "hap-clue-picam",
				"serial": "CAM" + cameras[i] + this.serialnumber.substring(4)
			};
		}
	}
};

/**
 * Set <code>CEC</code> accessories configuration
 */
CluePlatform.prototype.loadCecConfig = function ()
{
	if (this.config.cec == true)
	{
		var hdmi = JSON.parse(this.runCmd('/opt/clue/bin/setup -g cec -s json')).devices;

		for (var i in hdmi)
		{
			var id = hdmi[i].id;
			var version = hdmi[i].properties.version;
			var name = hdmi[i].properties.name;
			var type = hdmi[i].properties.type;
			var code1 = name.trim().replace(/\s/g, '').toLowerCase();
			var code2 = type.trim().replace(/\s/g, '').toLowerCase();
			var code = code1 + "_" + code2;

			if(code1 != "clue" && code1 != "raspberry" && version != "unknown" && version > "1.3" && this.getDeviceConfig(code) == null)
			{
				if(code2.indexOf("audio") < 0)
				{
					this.devices[code] =
					{
						"name": name,
						"type": "Switch",
						"on_cmd": "/opt/clue/bin/setup -s cec -on " + id ,
						"off_cmd": "/opt/clue/bin/setup -s cec -off " + id,
						"state_cmd": "/opt/clue/bin/setup -g cec -i power " + id,
						"state_on": "on",
						"state_off": "standby",
						"polling": true,
						"interval": 60,
						"manufacturer": "AMSD",
						"model": "hap-clue-cec",
						"serial": ("CEC" + id) + this.serialnumber.substring(("CEC" + id).length)
					};
				}
				else if( 1 == 2) //TODO - this type of device is not yet supported
				{
					this.devices[code] =
					{
						"name": name,
						"type": "Speaker",
						"up_cmd": "/opt/clue/bin/setup -s cec -v up",
						"down_cmd": "/opt/clue/bin/setup -s cec -v down",
						"mute_cmd": "/opt/clue/bin/setup -s cec -m",
						"state_cmd": "/opt/clue/bin/setup -g cec -v",
						"min_value": -35,
						"max_value": 120,
						"polling": true,
						"interval": 60,
						"manufacturer": "AMSD",
						"model": "hap-clue-cec",
						"serial": ("CEC" + id) + this.serialnumber.substring(("CEC" + id).length)
					};
				}
			}
		}
	}
};

/**
 * Set <code>RPiSensor</code> accessory configuration
 */
CluePlatform.prototype.loadRPiSensorConfig = function ()
{
	if (this.config.rpi == true)
	{
		this.devices.rpisensor =
		{
			"name": "RPiSensor",
			"type": "TemperatureSensor",
			"state_cmd": "/opt/clue/bin/setup -g raspberry -t",
			"min_value": -35,
			"max_value": 120,
			"polling": true,
			"interval": 60,
			"manufacturer": "element14",
			"serial": this.serialnumber,
			"model": this.modelnumber
		};
	}
};

/**
 * Returns the accessory device configuration from the device configuration list.
 *
 * @param code name of the accessory to find
 * @returns JSON configuration structure for found device
 */
CluePlatform.prototype.getDeviceConfig = function (code)
{
	var device = null;

	if( code != null)
	{
		for(var devcode in this.devices)
		{
			if(devcode == code)
			{
				device = this.devices[code];
				break;
			}
		}
	}

	return device;
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
	this.setService(accessory);
	this.accessories[accessory.context.code] = accessory;
};

/**
 * Method to setup accessories from config.json or defined built-in.
 */
CluePlatform.prototype.didFinishLaunching = function ()
{
	// Add or update accessories defined in config.json
	for (var code in this.devices)
	{
		this.addAccessory(code);
	}

	// Remove extra accessories in cache
	for (var index in this.accessories)
	{
		var accessory = this.accessories[index];

		if (!accessory.reachable)
		{
			this.removeAccessory(accessory);
		}
	}
};

/**
 * Adapt the accessory configuration to include missing attributes or to correct them
 * @param devcode accessory device code
 * @returns configuration structure
 */
CluePlatform.prototype.getImprovedDeviceConfig = function (devcode)
{
	var device = this.devices[devcode];

	if(device != null)
	{
		// adapt configuration and validate specific accessory attributes
		device.code = devcode;
		device.polling = device.polling === true;
		device.interval = parseInt(device.interval, 10) || 1;
		if (!device.type) device.type = "Switch";
		if (!device.title) device.title = devcode[0].toUpperCase() + devcode.slice(1);
		if (device.manufacturer) device.manufacturer = device.manufacturer.toString();
		if (device.model) device.model = device.model.toString();
		if (device.serial) device.serial = device.serial.toString();
		if (device.min_value) device.min_value = parseInt(device.min_value, 10) || 0;
			else device.min_value = 0;
		if (device.max_value) device.max_value = parseInt(device.max_value, 10) || 100;
			else device.max_value = 100;
		if (!device.dependency) device.dependency = null;
	}

	return device;
};

/**
 * Prepare the accessory context with the device configuration
 *
 * @param accessory accessory device instance
 * @param data accessory device configuration structure
 */
CluePlatform.prototype.setDeviceContext = function (accessory, data)
{
	// store and initialize variables into accessory context
	var cache = accessory.context;

	cache.name = data.name;
	cache.code = data.code;
	cache.type = data.type;
	cache.state = null;
	cache.model = data.model;
	cache.serial = data.serial;
	cache.manufacturer = data.manufacturer;
	cache.polling = data.polling;
	cache.interval = data.interval;
	if (data.on_cmd) cache.on_cmd = data.on_cmd;
	if (data.off_cmd) cache.off_cmd = data.off_cmd;
	if (data.state_cmd) cache.state_cmd = data.state_cmd;
	if (data.state_on) cache.state_on = data.state_on;
	if (data.state_off) cache.state_off = data.state_off;
	if (data.state_eval) cache.state_eval = data.state_eval;
	if (data.state_flow) cache.state_flow = data.state_flow;
	if (data.dependency) cache.dependency = data.dependency;
	if (data.min_value) cache.min_value = data.min_value;
	if (data.max_value) cache.max_value = data.max_value;
};

/**
 * Method to add and update HomeKit accessories.
 *
 * @param devcode configuration data structure
 */
CluePlatform.prototype.addAccessory = function (devcode)
{
	var data = null;

	if(devcode == null)
	{
		this.log.warn("No device name specified for accessory initialization process..");
		return;
	}
	else
	{
		data = this.getImprovedDeviceConfig(devcode);
		this.log.info("Initializing [%s] accessory..", data.name);
	}

	var accessory = this.accessories[devcode];
	var registration = false;

	// check if the accessory already exist
	if (!accessory)
	{
		// setup new accessory
		accessory = new Accessory(data.name, UUIDGen.generate(devcode), 8);
		registration = true;
	}

	// store and initialize configuration into accessory context
	this.setDeviceContext(accessory, data);

	// validate specific services attributes
	var service = accessory.getService(data.name);

		if(service == null)
		{
			service = Service[data.type];

			// if the accessory service type is not recognized, stop the process
			if (!service)
			{
				this.log.warn("Unknown service type for [%s] accessory service: %s", data.name, data.type);
				return;
			}

			// add the service to the accessory
			accessory.addService(service, data.name);

			// setup listeners for different accessory events
			this.setService(accessory);

		//initiative state
		accessory.context.state = this.getDirectStateValue(data);
	}

	if(registration)
	{
		// new accessory is always reachable
		accessory.reachable = true;

		// register new accessory in HomeKit
		this.api.registerPlatformAccessories("homebridge-clue", "clue", [accessory]);

		// store accessory in cache
		this.accessories[devcode] = accessory;
	}

	// retrieve initial state
	this.getInitState(accessory);

	// configure state polling
	if (data.polling && data.state_cmd)
	{
		this.statePolling(devcode);
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
		var code = accessory.context.code;

		clearTimeout(this.polling[code]);
		delete this.polling[code];

		this.api.unregisterPlatformAccessories("homebridge-clue", "clue", [accessory]);
		delete this.accessories[code];

		this.log.info("[%s] accessory has been removed from HomeBridge", code);
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
 */
CluePlatform.prototype.setService = function (accessory)
{
	var context = accessory.context;
	var service = accessory.getService(Service[context.type]);

	if (!service)
	{
		this.log.warn("[%s] not found to define service listeners..", context.name);
		return;
	}

	switch (context.type)
	{
		case "Switch":
			service.getCharacteristic(Characteristic.On)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			break;
		case "Outlet":
			service.getCharacteristic(Characteristic.On)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			break;
		case "Lightbulb":
			service.getCharacteristic(Characteristic.On)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			break;
		case "Door":
			service.getCharacteristic(Characteristic.LockCurrentState)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			service.getCharacteristic(Characteristic.LockTargetState)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			break;
		case "LockMechanism":
			service.getCharacteristic(Characteristic.CurrentDoorState)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			service.getCharacteristic(Characteristic.TargetDoorState)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			break;
		case "WindowCovering":
			service.getCharacteristic(Characteristic.CurrentPosition)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			service.getCharacteristic(Characteristic.TargetPosition)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			break;
		case "TemperatureSensor":
			service.getCharacteristic(Characteristic.CurrentTemperature)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context));
			service.getCharacteristic(Characteristic.CurrentTemperature)
				.setProps({minValue:context.min_value, maxValue:context.max_value});
			break;
		case "Speaker":
			service.getCharacteristic(Characteristic.Mute)
				.on('get', this.getCallbackStateValue.bind(this, accessory.context))
				.on('set', this.setCallbackStateValue.bind(this, accessory.context));
			break;
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
		.setCharacteristic(Characteristic.SerialNumber, accessory.context.serial || "000000000000")
		.setCharacteristic(Characteristic.FirmwareRevision, pjson.version || "1.0.0");

	var context = accessory.context;
	var service = accessory.getService(Service[context.type]);

	if (!context.polling)
	{
		switch (context.type)
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
				service.getCharacteristic(Characteristic.CurrentDoorState).getValue();
				service.getCharacteristic(Characteristic.TargetDoorState).getValue();
				break;
			case "LockMechanism":
				service.getCharacteristic(Characteristic.LockCurrentState).getValue();
				service.getCharacteristic(Characteristic.LockTargetState).getValue();
				break;
			case "WindowCovering":
				service.getCharacteristic(Characteristic.CurrentPosition).getValue();
				service.getCharacteristic(Characteristic.TargetPosition).getValue();
				break;
			case "TemperatureSensor":
				service.getCharacteristic(Characteristic.CurrentTemperature).getValue();
				break;
			case "Speaker":
				service.getCharacteristic(Characteristic.Mute).getValue();
				break;
		}
	}

	// Configured accessory is reachable
	accessory.updateReachability(true);
};

CluePlatform.prototype.getSwitchEvaluation = function (context, error, stdout)
{
	var input = stdout != null ? stdout.toString().trim().toLowerCase() : null;
	var output = null;

	if( error != null)
	{
		output = !error;
	}
	else
	{
		if (context.state_on)
		{
			var onarray = context.state_on.toLowerCase().split(",");
			var index = onarray.indexOf(input);

			if(index < 0)
			{
				if(context.state_off)
				{
					var offarray = context.state_off.toLowerCase().split(",");
					index = offarray.indexOf(input);

					if(index >= 0) output = false;
						else output = context.state;
				}
				else output = false;
			}
			else output = true;
		}
		else if (context.state_eval)
		{
			output = eval(context.state_eval);
		}
		else
		{
			output = input != null;
		}
	}

	return output;
};

CluePlatform.prototype.getSwitchExtendedEvaluation = function (context, error, stdout, onval, offval)
{
	var output = this.getSwitchEvaluation(context, error, stdout);

	if(output) return onval;
		else return offval;
};

CluePlatform.prototype.getDataEvaluation = function (context, type, error, stdout)
{
	var input = stdout != null ? stdout.toString().trim().toLowerCase() : null;
	var output = null;

	if(error != null)
	{
		output = error;
	}
	else if (context.state_eval)
	{
		output = eval(context.state_eval);
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
 * @param context specific data related to a specific service accessory
 * @returns {string} the output of the execution
 */
CluePlatform.prototype.getDirectStateValue = function (context)
{
	var output = null;
	var stdout = null;
	var cmd = this.getStateCommand(context);

	this.log.debug('[%s].[Get Direct State/Value] - Running command: %s', context.name, cmd);
	stdout = process.execSync(cmd);
	this.log.debug('[%s].[Get Direct State/Value] - Output value: %s', context.name, stdout != null ? stdout.toString().trim() : null);

	switch (context.type)
	{
		case "Switch":
			output = this.getSwitchEvaluation(context, null, stdout);
			break;
		case "Outlet":
			output = this.getSwitchEvaluation(context, null, stdout);
			break;
		case "Lightbulb":
			output = this.getSwitchEvaluation(context, null, stdout);
			break;
		case "Door":
			output = this.getSwitchExtendedEvaluation(context, null, stdout, Characteristic.LockCurrentState.CLOSED, Characteristic.LockCurrentState.OPEN);
			break;
		case "LockMechanism":
			output = this.getSwitchExtendedEvaluation(context, null, stdout, Characteristic.LockCurrentState.SECURED, Characteristic.LockCurrentState.UNSECURED);
			break;
		case "WindowCovering":
			output = this.getSwitchExtendedEvaluation(context, null, stdout, 100, 0);
			break;
		case "TemperatureSensor":
			output = this.getDataEvaluation(context, "float", null, stdout);
			break;
		case "Speaker":
			output = this.getDataEvaluation(context, "int", null, stdout);
			break;
	}

	this.log.debug('[%s].[Get Direct State/Value] - Computed state value: %s',context.name, output != null ? output.toString() : null);
	return output;
};

/**
 * Method to determine current state.
 *
 * @param devcode code of the accessory
 */
CluePlatform.prototype.statePolling = function (devcode)
{
	var accessory = this.accessories[devcode];

	if(accessory)
	{	
		// Clear polling
		clearTimeout(this.polling[devcode]);
		
		var self = this;
		var context = accessory.context;
		var service = accessory.getService(Service[context.type]);
		var command = this.getStateCommand(context);

		this.log.debug('[%s].[State Polling] - Running command: %s', context.name, command);

		// Execute command asynchronous to detect state
		process.exec(command, function (error, stdout, stderr)
		{
			var state = null;
			self.log.debug('[%s].[State Polling] - Output value: %s', context.name, stdout != null ? stdout.toString().trim() : null);

			switch (context.type)
			{
				case "Switch":
					state = self.getSwitchEvaluation(context, error, stdout);
					break;
				case "Outlet":
					state = self.getSwitchEvaluation(context, error, stdout);
					break;
				case "Lightbulb":
					state = self.getSwitchEvaluation(context, error, stdout);
					break;
				case "Door":
					state = self.getSwitchExtendedEvaluation(context, error, stdout, Characteristic.LockCurrentState.CLOSED, Characteristic.LockCurrentState.OPEN);
					break;
				case "LockMechanism":
					state = self.getSwitchExtendedEvaluation(context, error, stdout, Characteristic.LockCurrentState.SECURED, Characteristic.LockCurrentState.UNSECURED);
					break;
				case "WindowCovering":
					state = self.getSwitchExtendedEvaluation(context, error, stdout, 100, 0);
					break;
				case "TemperatureSensor":
					state = self.getDataEvaluation(context, "float", error, stdout);
					break;
				case "Speaker":
					state = self.getDataEvaluation(context, "int", error, stdout);
					break;
			}

			// Error detection and handling
			if (!error) self.log.debug('[%s].[State Polling] - Computed state value: %s', context.name, state != null ? state.toString() : null);
				else self.log.error('[%s].[State Polling] - Error executing state read: %s', stderr != null ? stderr.toString() : error.toString());

			if (!error && state !== context.state)
			{
				context.state = state;

				if (service != null)
				{
					switch (context.type)
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
							service.getCharacteristic(Characteristic.CurrentDoorState).getValue();
							break;
						case "LockMechanism":
							service.getCharacteristic(Characteristic.LockCurrentState).getValue();
							break;
						case "WindowCovering":
							service.getCharacteristic(Characteristic.CurrentPosition).getValue();
							break;
						case "TemperatureSensor":
							service.getCharacteristic(Characteristic.CurrentTemperature).getValue();
							break;
						case "Speaker":
							service.getCharacteristic(Characteristic.Mute).getValue();
							break;
					}
				}
			}
		});
	
		// Setup for next polling if the service still exist
		this.polling[devcode] = setTimeout(this.statePolling.bind(this, devcode), context.interval * 1000);
	}
};

/**
 * Method to determine current state.
 *
 * @param context accessory service context
 * @param callback callback function
 */
CluePlatform.prototype.getCallbackStateValue = function (context, callback)
{
	var self = this;
	var cmd = this.getStateCommand(context);

	if (context.polling)
	{
		// Get state directly from cache if polling is enabled
		this.log.debug("[%s].[Get Callback State/Value] - Pooling value: %s", context.name, this.getTextState(context.state));

		callback(null, context.state);
	}
	else
	{
		this.log.debug('[%s].[Get Callback State/Value] - Running command: %s', context.name, cmd);

		// Execute command asynchronous to detect state
		process.exec(cmd, function (error, stdout, stderr)
		{
			self.log.debug('[%s].[Get Callback State/Value] - Output value: %s', context.name, stdout != null ? stdout.toString().trim() : null);
			var state = null;

			switch (context.type)
			{
				case "Switch":
					state = self.getSwitchEvaluation(context, error, stdout);
					break;
				case "Outlet":
					state = self.getSwitchEvaluation(context, error, stdout);
					break;
				case "Lightbulb":
					state = self.getSwitchEvaluation(context, error, stdout);
					break;
				case "Door":
					state = self.getSwitchExtendedEvaluation(context, error, stdout, Characteristic.LockCurrentState.CLOSED, Characteristic.LockCurrentState.OPEN);
					break;
				case "LockMechanism":
					state = self.getSwitchExtendedEvaluation(context, error, stdout, Characteristic.LockCurrentState.SECURED, Characteristic.LockCurrentState.UNSECURED);
					break;
				case "WindowCovering":
					state = self.getSwitchExtendedEvaluation(context, error, stdout, 100, 0);
					break;
				case "TemperatureSensor":
					state = self.getDataEvaluation(context, "float", error, stdout);
					break;
				case "Speaker":
					state = self.getDataEvaluation(context, "int", error, stdout);
					break;
			}

			// Error detection and handling
			if (!error) self.log.debug('[%s].[Get Callback State/Value] - Computed state value: %s', context.name, state != null ? state.toString() : null);
				else self.log.error('[%s].[Get Callback State/Value] - Error executing state read: %s', stderr != null ? stderr.toString() : error.toString());

			callback(error, state);
		});
	}
};

CluePlatform.prototype.getStateCommand = function (context, state)
{
	var cmd = null;

	if(state != null)
	{
		if(context.on_cmd && context.off_cmd) cmd = state ? context.on_cmd : context.off_cmd;
			else if(context.on_cmd && !context.off_cmd) cmd = context.on_cmd;
				else if(!context.on_cmd && context.off_cmd) cmd = context.off_cmd;
	}
	else cmd = context.state_cmd;

	return cmd;
};

/**
 * Method to set the state of the service.
 *
 * @param context accessory service context
 * @param state accessory service new state
 */
CluePlatform.prototype.setDirectStateValue = function (context, state)
{
	var run = true;
	var accessory = this.accessories[context.code];
	var service = accessory.getService(Service[context.type]);
	var command = this.getStateCommand(context, state);

	this.log.debug('[%s].[Set Direct State/Value] - Running command: %s', context.name, command);

	try
	{
		var stdout = process.execSync(command);
		this.log.debug('[%s].[Set Direct State/Value] - Output value: %s', context.name, stdout != null ? stdout.toString().trim() : null);
	}
	catch(stderr)
	{
		this.log.error('[%s].[Set Direct State/Value] - Error executing state update: %s', context.name, stderr.toString());
		run = false;
	}

	if(run)
	{
		context.state = state;
		this.log.info('[%s].[Set Direct State/Value] - Computed state value: %s', context.name, this.getTextState(state));

		if (service != null)
		{
			switch (context.type)
			{
				case "Switch":
					service.getCharacteristic(Characteristic.On).updateValue(context.state);
					break;
				case "Outlet":
					service.getCharacteristic(Characteristic.On).updateValue(context.state);
					break;
				case "Lightbulb":
					service.getCharacteristic(Characteristic.On).updateValue(context.state);
					break;
				case "Door":
					service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(context.state);
					break;
				case "LockMechanism":
					service.getCharacteristic(Characteristic.LockCurrentState).updateValue(context.state);
					break;
				case "WindowCovering":
					service.getCharacteristic(Characteristic.CurrentPosition).updateValue(context.state);
					break;
				case "TemperatureSensor":
					service.getCharacteristic(Characteristic.CurrentTemperature).updateValue(context.state);
					break;
				case "Speaker":
					service.getCharacteristic(Characteristic.Mute).updateValue(context.state);
					break;
			}
		}
	}
};

/**
 * Method to set the state of the service.
 *
 * @param context accessory service context
 * @param state accessory service new state
 * @param callback callback function
 */
CluePlatform.prototype.setCallbackStateValue = function (context, state, callback)
{
	var self = this;
	var tout = null;
	var cmd = this.getStateCommand(context, state);

	//check dependencies for On event
	if (state && context.dependency != null)
	{
		var relbyaccessory = this.accessories[context.dependency];
		this.log.debug('[%s].[Set Callback State/Value] - Found dependency accessory; [%s]', context.name, relbyaccessory.context.name);
		var relbystate = this.getDirectStateValue(relbyaccessory.context);
		this.log.debug('[%s].[Set Callback State/Value]->[%s] - Computed state value: %s', context.name, relbyaccessory.context.name, this.getTextState(relbystate));

		if (relbystate != state)
		{
			this.setDirectStateValue(relbyaccessory.context, state);
			this.log.debug('[%s].[Set Callback State/Value]->[%s] - Updated state value: %s', context.name, relbyaccessory.context.name, this.getTextState(state));
		}
	}
	else if (!state) //check dependencies for Off event
	{
		// Check if all registered accessories depends by the current one
		for (var index in this.accessories)
		{
			var reltoaccessory = this.accessories[index];

			if (context.code != reltoaccessory.context.code && reltoaccessory.context.dependency == context.code)
			{
				this.log.debug('[%s].[Set Callback State/Value] - Found dependent accessory; [%s]', context.name, reltoaccessory.context.name);
				var reltostate = this.getDirectStateValue(reltoaccessory.context);
				this.log.debug('[%s].[Set Callback State/Value]->[%s] - Computed state value: %s', context.name, reltoaccessory.context.name, this.getTextState(reltostate));

				if (reltostate != state)
				{
					this.setDirectStateValue(reltoaccessory.context, state);
					this.log.debug('[%s].[Set Callback State/Value]->[%s] - Updated state value: %s', context.name, reltoaccessory.context.name, this.getTextState(state));
				}
			}
		}
	}

	this.log.debug('[%s].[Set Callback State/Value] - Running command: %s', context.name, cmd);

	// Execute command to set state
	process.exec(cmd, function (error, stdout, stderr)
	{
		self.log.debug('[%s].[Set Callback State/Value] - Output value: %s', context.name, stdout != null ? stdout.toString().trim() : null);

		// Error detection
		if (error && (state !== context.state))
		{
			self.log.error('[%s].[Set Callback State/Value] - Error executing state update: %s', context.name, stderr.toString());
		}
		else
		{
			self.log.info('[%s].[Set Callback State/Value] - Computed state value: %s', context.name, self.getTextState(state));

			context.state = state;
			error = null;
		}

		if (tout)
		{
			clearTimeout(tout);
			callback(error);
		}

		// run state workflow (commands) when teh state become On
		if(context.state)
		{
			setTimeout(function()
			{
				if(context.state_flow != null)
				{
					for (var index1 in context.state_flow)
					{
						try
						{
							self.runCmd(context.state_flow[index1]);
						}
						catch(err)
						{
							self.log.error("Error running operation command for [%s] accessory service: %s", context.name, err.message);
						}
					}
				}

				// Check if all registered accessories depends by the current one
				for (var index2 in self.accessories)
				{
					var reltoaccessory = self.accessories[index2];

					if (context.code != reltoaccessory.context.code && reltoaccessory.context.dependency == context.code)
					{
						self.log.debug('[%s].[Set Callback State/Value] - Found dependent accessory; [%s]', context.name, reltoaccessory.context.name);
						var reltostate = self.getDirectStateValue(reltoaccessory.context);
						self.log.debug('[%s].[Set Callback State/Value]->[%s] - Found vs Computed state value: %s vs. %s', context.name, reltoaccessory.context.name, self.getTextState(reltoaccessory.context.state), self.getTextState(reltostate));

						if (reltostate != reltoaccessory.context.state)
						{
							self.setDirectStateValue(reltoaccessory.context, reltostate);
							self.log.debug('[%s].[Set Callback State/Value]->[%s] - Updated state value: %s', context.name, reltoaccessory.context.name, self.getTextState(reltostate));
						}
					}
				}

			}, 1500);
		}
	});

	// Allow 1s to set state but otherwise assumes success
	tout = setTimeout(function ()
	{
		tout = null;
		self.log.warn("[%s].[Set Callback State/Value].[Timeout] - Waited too long time for turning %s, assuming success..",  context.name, self.getTextState(state));

		callback();
	}, 5000);
};

/**
 * Method to handle identify request.
 *
 * @param context accessory service context
 * @param paired paired device code
 * @param callback callback function
 */
CluePlatform.prototype.identify = function (context, paired, callback)
{
	this.log.info("[%s] identify requested!", context.name);
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
								"id": "state_flow",
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
								"id": "dependency",
								"title": "Depends by Accessory",
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
				newDevice.dependency = userInputs.dependency || newDevice.dependency;
				newDevice.state_flow = userInputs.state_flow || newDevice.state_flow;
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
						'dependency': accessory.context.dependency,
						'state_flow': accessory.context.state_flow,
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
