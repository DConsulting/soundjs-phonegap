this.createjs = this.createjs || {};

(function() {
    'use strict';

    function LowLatencyAudioPlugin() {
        this.AbstractPlugin_constructor();

        // PRIVATE PROPERTIES
        this._volume = 1;

        this._capabilities = s._capabilities;
        this._loaderClass = createjs.LowLatencyAudioLoader;
        this._soundInstanceClass = createjs.LowLatencyAudioInstance;
    }

    var p = createjs.extend(LowLatencyAudioPlugin, createjs.AbstractPlugin);
    var s = LowLatencyAudioPlugin;

    // STATIC PROPERTIES
    s._capabilities = null;

    // STATIC PUBLIC METHODS
    s.isSupported = function() {
        s._generateCapabilities();

        return 'cordova' in window;
    };

    s._generateCapabilities = function() {
        if (s._capabilities != null) return;

        s._capabilities = {
            panning: false,
            volume: true,
            tracks: -1
        };

        var supportedExtensions = createjs.Sound.SUPPORTED_EXTENSIONS;

        for (var i = 0, len = supportedExtensions.length; i < len; i++) {
            var ext = supportedExtensions[i];
            s._capabilities[ext] = true;
        }

        // 0=no output, 1=mono, 2=stereo, 4=surround, 6=5.1 surround.
        // See http://www.w3.org/TR/webaudio/#AudioChannelSplitter for more details on channels.
        //if (s.context.destination.numberOfChannels < 2) {
        //    s._capabilities.panning = false;
        //}
    };

    // PUBLIC METHODS
    p.toString = function() {
        return '[LowLatencyAudioPlugin]';
    };

    p.register = function (loadItem, instances) {
        var loader = this.AbstractPlugin_register(loadItem, instances);

        return loader;
    };

    p.removeSound = function (src) {
        this.AbstractPlugin_removeSound(src);
    };

    p.create = function (src, startTime, duration) {
        var si = this.AbstractPlugin_create(src, startTime, duration);
        si.setPlaybackResource(null);
        return si;
    };

    // plugin does not support these
    p.setVolume = p.getVolume = p.setMute = null;

    createjs.LowLatencyAudioPlugin = createjs.promote(LowLatencyAudioPlugin, 'AbstractPlugin');
}) ();

(function() {
    'use strict';

    function LowLatencyAudioRequest(loadItem) {
        this._loadItem = loadItem;

        this.AbstractRequest_constructor(loadItem);
    }

    var p = createjs.extend(LowLatencyAudioRequest, createjs.AbstractRequest);

    p.load = function () {
        var self = this;
        var evt = new createjs.Event('initialize');
        this.dispatchEvent(evt);

        setTimeout(function() {
            self.dispatchEvent('complete');
        }, 0);
    };

    p.destroy = function() {
        this.AbstractRequest_destroy();
    };

    createjs.LowLatencyAudioRequest = createjs.promote(LowLatencyAudioRequest, 'AbstractRequest');
}) ();

(function() {
    'use strict';

    function LowLatencyAudioLoader(loadItem) {
        this.AbstractLoader_constructor(loadItem, true, createjs.AbstractLoader.SOUND);
    }

    var p = createjs.extend(LowLatencyAudioLoader, createjs.AbstractLoader);
    var s = LowLatencyAudioLoader;

    s.context = null;
    s.canLoadItem = function (item) {
        return item.type == createjs.AbstractLoader.SOUND;
    };

    p.toString = function() {
        return '[LowLatencyAudioLoader]';
    };

    p._createRequest = function() {
        this._request = new createjs.LowLatencyAudioRequest(this._item);
    };

    createjs.LowLatencyAudioLoader = createjs.promote(LowLatencyAudioLoader, 'AbstractLoader');
}) ();

(function() {
    'use strict';

    /**
     * LowLatencyAudioInstance extends the base api of {{#crossLink "AbstractSoundInstance"}}{{/crossLink}} and is used by
     * {{#crossLink "LowLatencyAudioPlugin"}}{{/crossLink}}.
     *
     * @param {String} src The path to and file name of the sound.
     * @param {Number} startTime Audio sprite property used to apply an offset, in milliseconds.
     * @param {Number} duration Audio sprite property used to set the time the clip plays for, in milliseconds.
     * @param {Object} playbackResource Any resource needed by plugin to support audio playback.
     * @class WebAudioSoundInstance
     * @extends AbstractSoundInstance
     * @constructor
     */
    function LowLatencyAudioInstance(src, startTime, duration, playbackResource) {
        this.AbstractSoundInstance_constructor(src, startTime, duration, playbackResource);

        this._duration = 0;
    }

    var p = createjs.extend(LowLatencyAudioInstance, createjs.AbstractSoundInstance);
    var s = LowLatencyAudioInstance;

    s.context = null;

    // PUBLIC METHODS
    p.toString = function() {
      return '[LowLatencyAudioInstance]';
    };

    p.setMasterVolume = function(value) {
        this._updateVolume();
    };

    p.setMasterMute = function(isMuted) {
        this._updateVolume();
    };

    // PRIVATE METHODS
    p._removeLooping = function() {
        this._loopRequired = false;
    };

    p._addLooping = function() {
        this._loopRequired = true;
    };

    p._beginPlaying = function (offset, loop, volume, pan) {
        // We don't care about the default implementation
        // return this.AbstractSoundInstance__beginPlaying(offset, loop, volume, pan);
        var lla = window.plugins.LowLatencyAudio;
        var self = this;

        //this.setPosition(offset);
        this.setLoop(loop);
        this.setVolume(volume);
        //this.setPan(pan);

        setTimeout(function() {
            lla.preloadAudio(self.src, self.src, self._volume || 0.1, 1,
                function onPreloadSuccess() {
                    self._paused = false;
                    self._llaSoundPreloaded = true;
                    self._handleSoundReady();
                    self.playState = createjs.Sound.PLAY_SUCCEEDED;
                    self._sendEvent("succeeded");
                },
                function onPreloadFail() {
                    self._playFailed();
                }
            );
        }, 0);

        return true;
    };

    p._handleSoundReady = function (event) {
        var lla = window.plugins.LowLatencyAudio;

        if (this._loopRequired) {
            lla.loop(this.src);
        } else {
            lla.play(this.src);
        }

        this._updateVolume();
    };

    p._pause = function () {

    };

    p._resume = function () {

    };

    p._updateVolume = function() {
        // TODO: Add handling. If sound just started stop it and update the volume.
        var lla = window.plugins.LowLatencyAudio;

        console.log(this.src, this._volume);

        if (this._volume === 0) {
            this._stoppedBecauseOfMute = true;

            if (this._llaSoundPreloaded) {
                lla.stop(this.src);
            }
        } else if (this._stoppedBecauseOfMute) {
            if (this._llaSoundPreloaded) {
                if (this._loopRequired) {
                    lla.loop(this.src);
                } else {
                    lla.play(this.src);
                }
            }

            this._stoppedBecauseOfMute = false;
        }
    };

    p._calculateCurrentPosition = function () {
        return 0;
    };

    p._updatePosition = function () {
        //if (!this._paused) {this._handleSoundReady();}
    };

    p._handleLoop = function () {

    };

    p._updateDuration = function () {
        this._pause();
        this._resume();
    };

    p._handleStop = function() {
        var lla = window.plugins.LowLatencyAudio;
        //lla.stop(this.src);
    };

    p._handleCleanUp = function () {
        var lla = window.plugins.LowLatencyAudio;
        lla.unload(this.src);
    };


    createjs.LowLatencyAudioInstance = createjs.promote(LowLatencyAudioInstance, "AbstractSoundInstance");

}) ();