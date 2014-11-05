/*
 * PhonegapAudioPlugin
 */

/**
 * @module SoundJS
 */

// namespace:
this.createjs = this.createjs || {};

(function () {

	"use strict";

	/**
	 * Play sounds using the Phonegap Media plugin.
	 *
	 * @class PhonegapAudioPlugin
	 * @constructor
	 */
	function PhonegapAudioPlugin() {
		this._init();
	}

	var s = PhonegapAudioPlugin;

	/**
	 * The capabilities of the plugin. This is generated via the the SoundInstance {{#crossLink "PhonegapAudioPlugin/_generateCapabilities"}}{{/crossLink}}
	 * method. Please see the Sound {{#crossLink "Sound/getCapabilities"}}{{/crossLink}} method for an overview of all
	 * of the available properties.
	 * @property _capabilities
	 * @type {Object}
	 * @protected
	 * @static
	 */
	s._capabilities = null;


	/**
	 * Determine if the plugin can be used in the current browser/OS. Note that HTML audio is available in most modern
	 * browsers, but is disabled in iOS because of its limitations.
	 * @method isSupported
	 * @return {Boolean} If the plugin can be initialized.
	 * @static
	 */
	s.isSupported = function () {

		if (!('cordova' in window)) { return false; }

		s._generateCapabilities();
		if (s._capabilities == null) {return false;}

		return true;
	};

	/**
	 * Determine the capabilities of the plugin. Used internally. Please see the Sound API {{#crossLink "Sound/getCapabilities"}}{{/crossLink}}
	 * method for an overview of plugin capabilities.
	 * @method _generateCapabilities
	 * @static
	 * @protected
	 */
	s._generateCapabilities = function () {
		if (s._capabilities != null) {return;}
		var t = document.createElement("audio");
		if (t.canPlayType == null) {return null;}

		s._capabilities = {
			panning:true,
			volume:true,
			tracks:-1,
			mp3: true
		};
	}

	var p = PhonegapAudioPlugin.prototype;

	p._capabilities = null;

	/**
	 * Object hash indexed by the source of each file to indicate if an audio source is loaded, or loading.
	 * @property _audioSources
	 * @type {Object}
	 * @protected
	 * @since 0.4.0
	 */
	p._audioSources = null;

	/**
	 * An initialization function run by the constructor
	 * @method _init
	 * @protected
	 */
	p._init = function () {
		this._capabilities = s._capabilities;
		this._audioSources = {};
	};

	/**
	 * Pre-register a sound instance when preloading/setup. This is called by {{#crossLink "Sound"}}{{/crossLink}}.
	 * Note that this provides an object containing a tag used for preloading purposes, which
	 * <a href="http://preloadjs.com" target="_blank">PreloadJS</a> can use to assist with preloading.
	 * @method register
	 * @param {String} src The source of the audio
	 * @param {Number} instances The number of concurrently playing instances to allow for the channel at any time.
	 * @return {Object} A result object, containing a tag for preloading purposes and a numChannels value for internally
	 * controlling how many instances of a source can be played by default.
	 */
	p.register = function (src, instances) {
		this._audioSources[src] = true;  // Note this does not mean preloading has started

		return {
			numChannels: 1,
			tag: new createjs.PhonegapAudioPlugin.MockupTag(src)
			// Return an empty value. We don't need preloading with createjs
		};
	};

	/**
	 * Remove a sound added using {{#crossLink "PhonegapAudioPlugin/register"}}{{/crossLink}}. Note this does not cancel
	 * a preload.
	 * @method removeSound
	 * @param {String} src The sound URI to unload.
	 * @since 0.4.1
	 */
	p.removeSound = function (src) {
		delete(this._audioSources[src]);
		//createjs.PhonegapAudioPlugin.TagPool.remove(src);
	};

	/**
	 * Remove all sounds added using {{#crossLink "PhonegapAudioPlugin/register"}}{{/crossLink}}. Note this does not cancel a preload.
	 * @method removeAllSounds
	 * @param {String} src The sound URI to unload.
	 * @since 0.4.1
	 */
	p.removeAllSounds = function () {
		this._audioSources = {};
		//createjs.PhonegapAudioPlugin.TagPool.removeAll();
	};

	/**
	 * Create a sound instance. If the sound has not been preloaded, it is internally preloaded here.
	 * @method create
	 * @param {String} src The sound source to use.
	 * @param {Number} startTime Audio sprite property used to apply an offset, in milliseconds.
	 * @param {Number} duration Audio sprite property used to set the time the clip plays for, in milliseconds.
	 * @return {SoundInstance} A sound instance for playback and control.
	 */
	p.create = function (src, startTime, duration) {
		// if this sound has not be registered, create a tag and preload it
		if (!this.isPreloadStarted(src)) {
			this.preload(src, {
				numChannels: 1,
				tag: new createjs.PhonegapAudioPlugin.MockupTag(src)
			});
		}

		return new createjs.PhonegapAudioPlugin.SoundInstance(src, startTime, duration, this);
	};

	/**
	 * Checks if preloading has started for a specific source.
	 * @method isPreloadStarted
	 * @param {String} src The sound URI to check.
	 * @return {Boolean} If the preload has started.
	 */
	p.isPreloadStarted = function (src) {
		return (this._audioSources[src] != null);
	};

	/**
	 * Internally preload a sound.
	 * @method preload
	 * @param {String} src The sound URI to load.
	* @param {Object} tag An HTML audio tag used to load src.
	*/
	p.preload = function (src, tag) {
		this._audioSources[src] = true;

		if (tag && tag.tag && tag.tag.load) {
			tag.tag.load();
		}

		// createjs.Sound._sendFileLoadEvent(this.src);
	};

	p.toString = function () {
		return "[PhonegapAudioPlugin]";
	};

	createjs.PhonegapAudioPlugin = PhonegapAudioPlugin;


}());


(function () {

	"use strict";

	// NOTE Documentation for the SoundInstance class in WebAudioPlugin file. Each plugin generates a SoundInstance that
	// follows the same interface.
	function SoundInstance(src, startTime, duration, owner) {
		this._init(src, startTime, duration, owner);
	}

	var p = SoundInstance.prototype = new createjs.EventDispatcher();

	p.src = null;
	p.uniqueId = -1;
	p.playState = null;
	p._owner = null;
	p.loaded = false;
	p._offset = 0;
	p._startTime = 0;
	p._volume =  1;

	if (createjs.definePropertySupported) {
		Object.defineProperty(p, "volume", {
			get: function() {
				return this._volume;
			},
			set: function(value) {
				if (Number(value) == null) {return;}
				value = Math.max(0, Math.min(1, value));
				this._volume = value;
				this._updateVolume();
			}
		});
	}
	p.pan = 0;
	p._duration = 0;
	p._audioSpriteStopTime = null;	// PhonegapAudioPlugin only
	p._remainingLoops = 0;
	p._delayTimeoutId = null;
	p._pgMedia = null;
	p._muted = false;
	p.paused = false;
	p._paused = false;

	p._listenFor = {
		soundComplete: false,
		soundLoop: false
	};

	// Constructor
	p._init = function (src, startTime, duration, owner) {
		var self = this;
		var mediaSrc = src;

		if ('device' in window && device.platform === 'Android') {
			mediaSrc = '/android_asset/www/' + mediaSrc;
		}

		this._pgMedia = new Media(mediaSrc,
			function onMediaSuccess() {
				if (self._remainingLoops == 0) {
					self.handleSoundComplete(0);
				}
				else {
					self.handleSoundLoop(null); // This will also handle the sound complete case
				}
			},
			function onMediaError(e) {
				// TODO: Is this enough?
				self._cleanUp();
			},
			function onMediaStatus(mediaStatus) {
				if (self._duraiton == 0 && mediaStatus == Media.MEDIA_STOPPED) {
					var mediaDuration = self._pgMedia.getDuration();

					if (mediaDuration > 0) {
						self._duration = mediaDuration;
					}
				}
			}
		);

		this.src = src;
		this._startTime = startTime || 0;	// convert ms to s as web audio handles everything in seconds

		if (this._duration) {
			this._duration = duration;
		}

		this._owner = owner;
	};

	p._sendEvent = function (type) {
		var event = new createjs.Event(type);
		this.dispatchEvent(event);
	};

	p._cleanUp = function () {
		var pgMedia = this._pgMedia;

		if (pgMedia != null) {
			pgMedia.pause();

			this._listenFor.soundComplete = false;
			this._listenFor.soundLoop = false;

			try {
				this._pgMedia.seekTo(this._startTime);
			} catch (e) {
			} // Reset Position

			this._pgMedia.release();
			this._pgMedia = null;
		}

		clearTimeout(this._delayTimeoutId);
		createjs.Sound._playFinished(this);
	};

	p._interrupt = function () {
		if (this.tag == null) {return;}
		this.playState = createjs.Sound.PLAY_INTERRUPTED;
		this._cleanUp();
		this.paused = this._paused = false;
		this._sendEvent("interrupted");
	};

// Public API
	p.play = function (interrupt, delay, offset, loop, volume, pan) {
		this._cleanUp();
		createjs.Sound._playInstance(this, interrupt, delay, offset, loop, volume, pan);
	};

	p._beginPlaying = function (offset, loop, volume, pan) {
		if (this._pgMedia == null) {
			this.playFailed();
			return -1;
		}

		this._listenFor.soundComplete = true;

		// Reset this instance.
		this._offset = offset;
		this._volume = volume;
		this._updateVolume();
		this._remainingLoops = loop;
		this._handleSoundReady(null);

		this._sendEvent("succeeded");
		return 1;
	};

	p._handleSoundReady = function (event) {
		this.playState = createjs.Sound.PLAY_SUCCEEDED;
		this.paused = this._paused = false;

		this._listenFor.soundLoop = false;

		// Phonegap duration will not be there most of the time due to the way the plugin works.
		if (this.getDuration() > 0 && this._offset >= this.getDuration()) {
			this.playFailed();
			return;
		}

		this._pgMedia.seekTo(this._startTime + this._offset);

		if (this._remainingLoops == -1) {
			//this.tag.loop = true;
			// TODO: Perhaps we should do something else here
		} else if(this._remainingLoops != 0) {
			this._listenFor.soundLoop = true;
			//this.tag.loop = true;
			// TODO: Perhaps we should do something else here
		}

		this._pgMedia.play();
	};

	p.pause = function () {
		if (!this._paused && this.playState == createjs.Sound.PLAY_SUCCEEDED && this.tag != null) {
			this.paused = this._paused = true;
			this._pgMedia.pause();

			clearTimeout(this._delayTimeoutId);
			return true;
		}
		return false;
	};

	p.resume = function () {
		if (!this._paused || this._pgMedia == null) {return false;}
		this.paused = this._paused = false;
		this._pgMedia.play();
		return true;
	};

	p.stop = function () {
		this._offset = 0;
		this.pause();
		this.playState = createjs.Sound.PLAY_FINISHED;
		this._cleanUp();
		return true;
	};

	p.setMasterVolume = function (value) {
		this._updateVolume();
	};

	p.setVolume = function (value) {
		this._volume = value;
		this._updateVolume();
		return true;
	};

	p._updateVolume = function () {
		if (this._pgMedia != null) {
			var newVolume = (this._muted || createjs.Sound._masterMute) ? 0 : this._volume * createjs.Sound._masterVolume;

			this._pgMedia.setVolume(newVolume);
		}
	};

	p.getVolume = function (value) {
		return this._volume;
	};

	p.setMasterMute = function (isMuted) {
		this._updateVolume();
	};

	p.setMute = function (isMuted) {
		if (isMuted == null) {return false;}
		this._muted = isMuted;
		this._updateVolume();
		return true;
	};

	p.getMute = function () {
		return this._muted;
	};

	// Can not set pan in HTML audio
	p.setPan = function (value) {
		return false;
	};

	p.getPan = function () {
		return 0;
	};

	p.getPosition = function () {
		if (this._pgMedia == null) { return this._pgMedia; }

		this._pgMedia.getCurrentPosition(); // Call this to force position update.
		return this._pgMedia.position * 1000 - this._startTime;
	};

	p.setPosition = function (value) {
		if (this._pgMedia == null) {
			this._offset = value
		} else {
			this._listenFor.soundLoop = false;

			try {
				value = value + this._startTime;

				this._pgMedia.seekTo(value);
			} catch (error) { // Out of range
				return false;
			}

			this._listenFor.soundLoop = true;
		}
		return true;
	};

	p.getDuration = function () {  // NOTE this will always return 0 until sound has been played unless it is set
		return this._duration;
	};

	p.handleSoundComplete = function (event) {
		this._offset = 0;
		this.playState = createjs.Sound.PLAY_FINISHED;
		this._cleanUp();

		this._sendEvent("complete");
	};

	p.handleSoundLoop = function (event) {
		this._offset = 0;
		this._remainingLoops--;

		if(this._remainingLoops == 0) {
			if (this._listenFor.soundComplete) {
				this._sendEvent("loop");
				this.handleSoundComplete();
				return;
			}
		}
		else {
			this._pgMedia.seekTo(this._startTime);
			this._pgMedia.play();
		}

		this._sendEvent("loop");
	};

	p.playFailed = function () {
		this.playState = createjs.Sound.PLAY_FAILED;
		this._cleanUp();
		this._sendEvent("failed");
	};

	p.toString = function () {
		return "[PhonegapAudioPlugin SoundInstance]";
	};

	createjs.PhonegapAudioPlugin.SoundInstance = SoundInstance;

}());

(function () {
	"use strict";

	function PhonegapMockupTag(src) {

		this.src = src;
	}

	PhonegapMockupTag.prototype.load = function() {
		createjs.Sound._sendFileLoadEvent(this.src);

		if (this.onreadystatechange != null) {
			this.onreadystatechange();
		}
	}

	PhonegapMockupTag.prototype.readyState = 'complete'; // Mockup ready state

	createjs.PhonegapAudioPlugin.MockupTag = PhonegapMockupTag;
} ());