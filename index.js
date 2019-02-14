// Accessory for controlling BenQ Projectors via HomeKit.
// Adapted from https://github.com/rooi/homebridge-marantz-rs232

var SerialPort = require("serialport");
var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    
    homebridge.registerAccessory("homebridge-benq-projector", "BenQ-Projector", BenQProjector);
}
    
    
function BenQProjector(log, config) {
    // Configuration
    this.name = config['name'];
    this.model = config['model'];
    this.adapter = config['adapter'];
    this.inputs = config['inputs'];
    
    this.timeout = config.timeout || 1000;
    this.queue = [];
    this.callbackQueue = [];
    this.ready = true;
    
    this.log = log;

    this.enabledServices = []
    this.commands = {
        "Power On": "\r*pow=on#\r",
        "Power Off": "\r*pow=off#\r",
        "Power State": "\r*pow=?#\r",
        "Mute On": "\r*mute=on#\r",
        "Mute Off": "\r*mute=off#\r",
        "Mute State": "\r*mute=?#\r",
        "Volume Up": "\r*vol=+#\r",
        "Volume Down": "\r*vol=-#\r",
        "Volume State": "\r*vol=?#\r",
        "Source Set": "\r*sour=",
        "Source Get": "\r*sour=?#\r"
    }
    this.buttons = {
      [Characteristic.RemoteKey.ARROW_UP]: '\r*up#\r',
      [Characteristic.RemoteKey.ARROW_DOWN]: '\r*down#\r',
      [Characteristic.RemoteKey.ARROW_LEFT]: '\rleft#\r',
      [Characteristic.RemoteKey.ARROW_RIGHT]: '\rright#\r',
      [Characteristic.RemoteKey.SELECT]: '\renter#\r',
      [Characteristic.RemoteKey.BACK]: '\r*menu=off#\r',
      [Characteristic.RemoteKey.EXIT]: '\r*menu=off#\r',
      [Characteristic.RemoteKey.INFORMATION]: '\r*menu=on#\r',
    };
    this.default_inputs = [
      {"input": "RGB", "label": "COMPUTER/YPbPr"},
      {"input": "RGB2", "label": "COMPUTER 2/YPbPr2"},
      {"input": "ypbr", "label": "Component"},
      {"input": "dviA", "label": "DVI-A"},
      {"input": "dvid", "label": "DVI-D"},
      {"input": "hdmi", "label": "HDMI 1"},
      {"input": "hdmi2", "label": "HDMI 2"},
      {"input": "vid", "label": "Composite"},
      {"input": "svid", "label": "S-Video"},
      {"input": "network", "label": "Network"},
      {"input": "usbdisplay", "label": "USB Display"},
      {"input": "usbreader", "label": "USB Reader"}
    ]
    
    /////////////////////////////
    // Setup Serial Connection //
    /////////////////////////////
    this.serialPort = new SerialPort(this.adapter, {
      baudRate: 115200,
      autoOpen: false
    }); // this is the openImmediately flag [default is true]
    
    // Use a `\r\n` as a line terminator
    const parser = new SerialPort.parsers.Readline({
      delimiter: '\r'
    });
    
    this.serialPort.pipe(parser);
    
    parser.on('data', function(data) {
      this.log.info("Received data: " + data);
      this.serialPort.close(function(error) {
        this.log.debug("Closing connection");
        if(error) this.log.error("Error when closing connection: " + error)
        var callback;
        if(this.callbackQueue.length) callback = this.callbackQueue.shift()
          if(callback) callback(data,0);
      }.bind(this)); // close after response
    }.bind(this));
}
    
BenQProjector.prototype = {

    //////////////////////////////
    // Serial Command Functions //
    //////////////////////////////
        
    send: function(cmd, callback) {
        this.sendCommand(cmd, callback); 
        //if (callback) callback();
    },
        
    exec: function() {
        // Check if the queue has a reasonable size
        if(this.queue.length > 100) {
            this.queue.clear();
            this.callbackQueue.clear();
        }
        
        this.queue.push(arguments);
        this.process();
    },
        
    sendCommand: function(command, callback) {
        this.log.info("serialPort.open");
        if(this.serialPort.isOpen){
            this.log.debug("serialPort is already open...");
            if(callback) callback(0,1);
        }
        else{
            this.serialPort.open(function (error) {
                             if(error) {
                                this.log.error("Error when opening serialport: " + error);
                                if(callback) callback(0,error);
                             }
                             else {
                                 if(callback) this.callbackQueue.push(callback);
                                 this.serialPort.write(command, function(err) {
                                                   if(err) this.log.error("Write error = " + err);
                                                   //this.serialPort.drain();
                                                   }.bind(this));
                             }
                             //            if(callback) callback(0,0);
                             }.bind(this));
        }
    },
        
    process: function() {
        if (this.queue.length === 0) return;
        if (!this.ready) return;
        var self = this;
        this.ready = false;
        this.send.apply(this, this.queue.shift());
        
        setTimeout(function () {
                   self.ready = true;
                   self.process();
                   }, this.timeout);
    },






    ///////////////////////////
    // Functions for HomeKit //
    ///////////////////////////

    getPowerState: function(callback) {
        var cmd = this.commands['Power State'];
        
        this.log.debug("getPowerState");
        
        this.exec(cmd, function(response,error) {
                  
                  this.log.debug("Power state is: " + response);
                  if (response && response.indexOf("*POW=ON#") > -1) {
                  if(callback) callback(null, true);
                  }
                  else {
                  if(callback) callback(null, false);
                  }
                  }.bind(this))
        
    },
        
    setPowerState: function(powerOn, callback) {
        var cmd;
        
        if (powerOn) {
            cmd = this.commands['Power On'];
            this.log.info("Set", this.name, "to on");
        }
        else {
            cmd = this.commands['Power Off'];
            this.log.info("Set", this.name, "to off");
        }

        this.exec(cmd, function(response,error) {
                  if (error) {
                  this.log.error('Serial power function failed: %s');
                  if(callback) callback(error);
                  }
                  else {
                  this.log.debug('Serial power function succeeded!');
                  if(callback) callback();
                  }
                  }.bind(this));
    },
        
    getMuteState: function(callback) {
        var cmd = this.commands['Mute State'];
        
        this.exec(cmd, function(response, error) {
                  
                  this.log.info("Mute state is:", response);
                  if (response && response.indexOf("*MUTE=ON#") > -1) {
                  callback(null, true);
                  }
                  else {
                  callback(null, false);
                  }
                  }.bind(this))
        
    },
        
    setMuteState: function(muteOn, callback) {
        var cmd;
        
        if (muteOn) {
            cmd = this.commands['Mute On'];
            this.log.info(this.name, "muted");
        }
        else {
            cmd = this.commands['Mute Off'];
            this.log.info(this.name, "unmuted");
        }
        
        this.exec(cmd, function(response, error) {
                  if (error) {
                  this.log.error('Serial mute function failed: %s');
                  callback(error);
                  }
                  else {
                  this.log.debug('Serial mute function succeeded!');
                  callback();
                  }
                  }.bind(this));
    },
        
    getVolume: function(callback) {
        var cmd = this.commands['Volume State'];
        
        this.exec(cmd, function(response, error) {
                  
            //VOL:xxxy(xxx)
            if(response && response.indexOf("*VOL=") > -1) {
                  var vol = Number(response.split('=')[1].split('#'));
                  this.volume = vol;
                //   this.volume = this.dbToPercentage(Number(vol));
                  //console.log("this.volume=" + this.volume);
                  callback(null, vol);
            }
            else callback(null,0);
        }.bind(this))
    },

    setVolumeState: function(value, callback) {
        this.getVolume();
        var volDiff = this.volume - value;
        this.log.info("Setting volume to %s", value);
        if (volDiff > 0) {
            while (volDiff > 0)
            this.setVolumeRelative(Characteristic.VolumeSelector.INCREMENT)
        } else if (volDiff < 0) {
            while (volDiff < 0)
            this.setVolumeRelative(Characteristic.VolumeSelector.DECREMENT)
        }
        var cmd = this.commands['Volume State'];
        
        this.exec(cmd, function(response, error) {
                  
            //VOL:xxxy(xxx)
            if(response && response.indexOf("*VOL=") > -1) {
                  var vol = Number(response.split('=')[1].split('#'));
                //   this.volume = this.dbToPercentage(Number(vol));
                  //console.log("this.volume=" + this.volume);
                  callback(null, vol);
            }
            else callback(null,0);
        }.bind(this))
    },

    setVolumeRelative: function(volumeDirection, callback) {
        // Change volume by pressing Volume Up or Volume Down
      if (volumeDirection == Characteristic.VolumeSelector.INCREMENT) {
        var cmd = this.commands['Volume Up'];
      } else if (volumeDirection == Characteristic.VolumeSelector.DECREMENT) {
        var cmd = this.commands['Volume Up'];
      } else {
        that.log.error( "setVolumeRelative - VOLUME : ERROR - unknown direction sent");
        callback(error);
      }

      this.exec(cmd, function(response, error) {
        if (error) {
            this.log.error('Serial change volume function failed: ' + error);
            callback(error);
        }
        else {
            this.log.debug("Changing volume");
            callback();
        }
    }.bind(this));
    },
        
    getInputSource: function(callback) {
        var cmd = this.commands['Source Get'];
        
        this.exec(cmd, function(response, error) {

            if(response && response.indexOf("*sour=") > -1) {
                  
                  var src = response.split("=")[1].split("#");
                  var srcNr = 0;
                  this.default_inputs.forEach((i, x) =>  {
                    if (i['name'] == src) {
                      srcNr = x;
                      this.log.debug("Input is %s", i['name']);
                    }
                  })
                  //console.log("src =" + src + " srcNr = " + srcNr);
                  callback(null, srcNr);
            }
            else callback(null,0);
        }.bind(this))
    },
        
    setInputSource: function(port, callback) {
        var cmd = this.commands['Source Set'];
        var input = this.default_inputs[port];
        cmd = cmd + input['input'] + "\r"
        
        this.log.info('Setting Input %s.', input['input'])
        this.exec(cmd, function(response, error) {
            if (error) {
                this.log.error('Set Input function failed: ' + error);
                callback(error);
            }
            else {
                this.log.debug('Set Input function succeeded!');
                callback();
            }
        }.bind(this));
    },
        
    identify: function(callback) {
        this.log.info("Identify requested!");
        
        this.setPowerState(true); // turn on
        
        if(callback) callback();
    },

    remoteKeyPress: function(button, callback) {
      if (this.buttons[button]) {
        var press = this.buttons[button]
        this.log.info("remoteKeyPress - INPUT: pressing key %s", press);
        this.exec(press, function(response, error) {
          if (error) {
              this.log.error("remoteKeyPress - INPUT: ERROR pressing button %s.", press);
              callback(error);
          }
          else {
              this.log.debug("remoteKeyPress - INPUT: pressing key %s succeeded", press);
              callback();
          }
        }.bind(this) );
      } else {
        this.log.error('Remote button %d not supported.', button)
      }
    },

    addSources: function(service) {
      // If input name mappings are provided, use them.
      // Else, load all inputs from query (useful for finding inputs to map).
      this.default_inputs.forEach((i, x) =>  {
        if (this.inputs) {
          if (this.inputs[i['label']]) {
            var inputName = this.inputs[i['label']]
            let tmpInput = new Service.InputSource(inputName, 'inputSource' + x);
            tmpInput
              .setCharacteristic(Characteristic.Identifier, x)
              .setCharacteristic(Characteristic.ConfiguredName, inputName)
              .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
              .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION);
        
            service.addLinkedService(tmpInput);
            this.enabledServices.push(tmpInput);
          }
        } else {
          var inputName = i['label']
          let tmpInput = new Service.InputSource(inputName, 'inputSource' + x);
          tmpInput
            .setCharacteristic(Characteristic.Identifier, x)
            .setCharacteristic(Characteristic.ConfiguredName, inputName)
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION);
    
          service.addLinkedService(tmpInput);
          this.enabledServices.push(tmpInput);
        }
      })
    
    },
        
    getServices: function() {
        
        var informationService = new Service.AccessoryInformation();
        informationService
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.Manufacturer, "BenQ")
        .setCharacteristic(Characteristic.Model, this.model)
        .setCharacteristic(Characteristic.SerialNumber, "-");

        this.enabledServices.push(informationService);

        this.tvService = new Service.Television(this.name);

        this.tvService
          .setCharacteristic(Characteristic.ConfiguredName, this.name);
      
        this.tvService
          .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
      
        this.addSources(this.tvService)

        this.tvService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));

        this.tvService
          .getCharacteristic(Characteristic.On)
          .on('get', this.getPowerState.bind(this))
          .on('set', this.setPowerState.bind(this));

        this.tvService
            .getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set', this.setInputSource.bind(this))
            .on('get', this.getInputSource.bind(this));
      
        this.tvService
            .getCharacteristic(Characteristic.RemoteKey)
            .on('set', this.remoteKeyPress.bind(this));
        
        this.enabledServices.push(this.tvService);
        this.prepareTvSpeakerService();
        return this.enabledServices;
    }
    
};

BenQProjector.prototype.prepareTvSpeakerService = function() {

  this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
  this.tvSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
  this.tvSpeakerService
      .getCharacteristic(Characteristic.VolumeSelector)
      .on('set', this.setVolumeRelative.bind(this));
  this.tvSpeakerService
      .getCharacteristic(Characteristic.Mute)
      .on('get', this.getMuteState.bind(this))
      .on('set', this.setMuteState.bind(this));
  this.tvSpeakerService
      .addCharacteristic(Characteristic.Volume)
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolumeState.bind(this));

  this.tvService.addLinkedService(this.tvSpeakerService);
  this.enabledServices.push(this.tvSpeakerService);

};