this.createjs = this.createjs || {};

(function() {
    'use strict';

    var p = createjs.extend(NativeAudioPlugin, createjs.AbstractPlugin);

    function NativeAudioPlugin() {
        this.AbstractPlugin_constructor();

        // PRIVATE PROPERTIES
        this._volume = 1;

        this._capabilities = s._capabilities;
        this._loaderClass = createjs.NativeAudioLoader;
        this._soundInstanceClass = createjs.NativeAudioInstance;
    }
    var s = NativeAudioPlugin;

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
        return '[NativeAudioPlugin]';
    };

    p.register = function (loadItem, instances) {
        if (typeof loadItem === 'string') {
            // This is an url but AbstractPlugin_register expects an object with src property.
            loadItem = {src: loadItem};
        }

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

    createjs.NativeAudioPlugin = createjs.promote(NativeAudioPlugin, 'AbstractPlugin');
}) ();

(function() {
    'use strict';

    function NativeAudioRequest(loadItem) {
        this._loadItem = loadItem;

        this.AbstractRequest_constructor(loadItem);
    }

    var p = createjs.extend(NativeAudioRequest, createjs.AbstractRequest);

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

    createjs.NativeAudioRequest = createjs.promote(NativeAudioRequest, 'AbstractRequest');
}) ();

(function() {
    'use strict';

    function NativeAudioLoader(loadItem) {
        this.AbstractLoader_constructor(loadItem, true, createjs.AbstractLoader.SOUND);
    }

    var p = createjs.extend(NativeAudioLoader, createjs.AbstractLoader);
    var s = NativeAudioLoader;

    s.context = null;
    s.canLoadItem = function (item) {
        return item.type == createjs.AbstractLoader.SOUND;
    };

    p.toString = function() {
        return '[NativeAudioLoader]';
    };

    p._createRequest = function() {
        this._request = new createjs.NativeAudioRequest(this._item);
    };

    createjs.NativeAudioLoader = createjs.promote(NativeAudioLoader, 'AbstractLoader');
}) ();

(function() {
    'use strict';

    /**
     * NativeAudioInstance extends the base api of {{#crossLink "AbstractSoundInstance"}}{{/crossLink}} and is used by
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
    function NativeAudioInstance(src, startTime, duration, playbackResource) {
        this.AbstractSoundInstance_constructor(src, startTime, duration, playbackResource);

        this._duration = 0;
    }

    var p = createjs.extend(NativeAudioInstance, createjs.AbstractSoundInstance);
    var s = NativeAudioInstance;

    s.context = null;

    // PUBLIC METHODS
    p.toString = function() {
      return '[NativeAudioInstance]';
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
        var nativeAudio = window.plugins.NativeAudio;
        var self = this;

        //this.setPosition(offset);
        this.setLoop(loop);
        this.setVolume(volume);
        //this.setPan(pan);

        // _addLooping doesn't get called for some erason. Attach the correct value manually here.
        if (loop < 0) {
            this._loopRequired = true;
        }

        setTimeout(function() {
            nativeAudio.preloadComplex(self.src, self.src, 1 /*self._volume || 0.1*/, 1, 0,
                function onPreloadSuccess() {
                    setTimeout(function() {
                        self._paused = false;
                        self._nativeSoundPreloaded = true;
                        self._handleSoundReady();
                        self._updateVolume();
                        self.playState = createjs.Sound.PLAY_SUCCEEDED;
                        self._sendEvent("succeeded");
                    }, 0);
                },
                function onPreloadFail() {
                    setTimeout(function() {
                        self._playFailed();
                    }, 0);
                }
            );
        }, 0);

        return true;
    };

    p._handleSoundReady = function (event) {
        var nativeAudio = window.plugins.NativeAudio;
        var self = this;

        if (this._loopRequired) {
            this._handleLoop();
        } else {
            nativeAudio.play(self.src,
                function onPlaySuccess() {
                    setTimeout(function() {
                        // Do nothing. Play successful.
                    }, 0);
                },
                function onPlayFail() {
                    setTimeout(function() {
                        self._playFailed();
                    }, 0);
                }
            );
        }
    };

    p._pause = function () {
        // Not supported with NativeAudio at the moment
    };

    p._resume = function () {
        // Not supported with NativeAudio at the moment
    };

    p._updateVolume = function() {
        // TODO: Add handling. If sound just started stop it and update the volume.
        var nativeAudio = window.plugins.NativeAudio;

        if (this._volume === 0) {
            this._stoppedBecauseOfMute = true;

            if (this._nativeSoundPreloaded) {
                nativeAudio.stop(this.src);
            }
        } else if (this._stoppedBecauseOfMute) {
            if (this._nativeSoundPreloaded) {
                this._handleSoundReady();
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
        var nativeAudio = window.plugins.NativeAudio;
        var self = this;

        console.log('handle loop');

        nativeAudio.play(self.src,
            angular.noop,
            function onPlayFail() {
                setTimeout(function() {
                    self._playFailed();
                }, 0);
            },
            function onPlayComplete() {
                setTimeout(function() {
                    self._handleLoop();
                }, 0);
            }
        );
    };

    p._updateDuration = function () {
        this._pause();
        this._resume();
    };

    p._handleStop = function() {
        var nativeAudio = window.plugins.NativeAudio;
        //nativeAudio.stop(this.src);
    };

    p._handleCleanUp = function () {
        var nativeAudio = window.plugins.NativeAudio;
        nativeAudio.unload(this.src);
    };

    createjs.NativeAudioInstance = createjs.promote(NativeAudioInstance, "AbstractSoundInstance");

}) ();