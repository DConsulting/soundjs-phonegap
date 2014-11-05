(function(window) {
	'use strict';

	FlashCanvasManager.Events = {
		DEPENDENCIES_LOADED: 'dependencies_loaded',
		SCRIPT_LOADED: 'script_complete',
		STAGE_CREATED: 'stage_created',
		STAGE_DESTROY: 'stage_destroy',
		ROOT_READY: 'root_ready',
		ROOT_DESTROY: 'root_destroy'
	};

	function FlashCanvasManager(canvasElement) {
		if (!FlashCanvasManager.moviesCache) {
			FlashCanvasManager.moviesCache = new createjsUtil.MoviesCache();
		}

		this.canvas = $(canvasElement);
		this.stage = new createjs.Stage(canvasElement);
		this.root = null;
		this.rootName = null;
		this.images = {};
		this.lib = {};
	}

	FlashCanvasManager.prototype.baseManifestPath = function(value) {
		if (value === undefined) {
			return this._baseManifestPath;
		} else {
			this._baseManifestPath = value;
		}
	};

	/**
	 * CAN OVERRIDE
	 * Override if you want to update stage and root properties before the root is attached to the stage.
	 */
	FlashCanvasManager.prototype.prepareStage = function(stage, root) {

	};

	/**
	 * CAN OVERRIDE
	 *
	 * Resolves a manifest entry path. Override in case you moved the exported flash lib dependencies
	 * to a different folder. If null is returned then the entry won't be loaded.
	 *
	 * @param {Object} entry Manifest entry
	 * @returns {String} The resolved url or null if the item must be omitted.
	 */
	FlashCanvasManager.prototype.resolveManifestPath = function(entry) {
		return entry.src;
	};

	/**
	 * Override to allow movie caching. If you are giving custom promise on load there is no way to detect the url.
	 * @param {Promise} [promise]
	 * @returns {String}
	 */
	FlashCanvasManager.prototype.cacheIdForPromise = function(promise) {
		return null;
	};

	FlashCanvasManager.prototype.attachRoot = function() {
		if (this.stage == null) {
			throw 'Stage is undefined';
		}
		else if (self.root) {
			throw 'Root is already attached';
		}

		this.root = new this.lib[this.rootName]();

		this.prepareStage(this.stage, this.root);
		this.stage.addChild(this.root);
		this.stage.update();

		// We should probably clear previous stage.Not sure yet.
		createjs.Ticker.setFPS(this.lib.properties.fps);
		createjs.Ticker.addEventListener('tick', this.stage);

		this.dispatchEvent(FlashCanvasManager.Events.ROOT_READY);
	};

	FlashCanvasManager.prototype.loadScript = function(scriptPath, rootName, doneCallback) {
		// TODO: Complete method implementation. Use createjs loader
		this.cacheIdForPromise = function(promise) { return scriptPath; };
	};

	FlashCanvasManager.prototype.loadScriptPromise = function(promise, rootName, doneCallback) {
		this.rootName = rootName;
		var self = this;
		var cacheId = self.cacheIdForPromise(promise);

		promise.then(
			function(data) {
				if (typeof data === 'object') {
					// Not a string. Search the content in most probable property names;
					data = data.data || data.text || data.response;
				}

				var lib, images, cachedMovie;

				if (cacheId && FlashCanvasManager.moviesCache.contains(cacheId)) {
					cachedMovie = FlashCanvasManager.moviesCache.get(cacheId);
					lib = self.lib = cachedMovie.lib;
					images = self.images = cachedMovie.images;
				}
				else {
					lib = self.lib;
					images = self.images;

					// We are forced to use eval due to the way flash exports the content.
					// Remove duplicate values and execute the script;
					eval(data.substr(0, data.lastIndexOf(');') + 2)); // jshint ignore:line

					if (cacheId) {
						FlashCanvasManager.moviesCache.add(cacheId, lib, images);
					}
				}

				// CreateJS load queue modifies URLs so prevent using basePath with cached objects.
				var baseManifestPath = cachedMovie == null ? self._baseManifestPath : null;

				self.loadDependencies(lib.properties.manifest, baseManifestPath, function() {
					if (self._isDisposed) return;

					alert('d load done');
					self.dispatchEvent(FlashCanvasManager.Events.SCRIPT_LOADED);
					self.attachRoot();

					if (doneCallback) {
						doneCallback();
					}
				});
			},
			function() {
				if (console && console.warn) {
					console.warn('Can load createjs script file.');
				}
			}
		);
	}

	/**
	 * @param {Array} manifest
	 */
	FlashCanvasManager.prototype.loadDependencies = function(manifest, basePath, doneCallback) {
		if (!this.rootName) {
			throw 'Set rootName before loading dependencies.';
		}

		var loader = new createjs.LoadQueue(false, basePath);
		var self = this;

		var handleFileLoad = function(evt) {
			if (evt.item.type == "image") { self.images[evt.item.id] = evt.result; }
		};

		var handleComplete = function() {
			if (doneCallback) {
				doneCallback();
			}

			self.dispatchEvent(FlashCanvasManager.Events.DEPENDENCIES_LOADED);
		};

		loader.installPlugin(createjs.Sound);
		loader.addEventListener("fileload", handleFileLoad);
		loader.addEventListener("complete", handleComplete);

		if (manifest.length) {
			loader.loadManifest(manifest);
		} else {
			// For some reason an empty manifest file never completes loading
			handleComplete();
		}
	};

	/**
	 * Removes the root from the stage
	 * @param {Boolean} destroyStage If true then the stage will also be destroyed.
	 */
	FlashCanvasManager.prototype.clearStage = function(destroyStage) {
		if (destroyStage === undefined) {
			throw  'Destroy stage must have a value of "true" or "false".';
		}

		if (destroyStage && this.stage) {
			createjs.Ticker.removeEventListener('tick', this.stage);
			this.dispatchEvent(FlashCanvasManager.Events.STAGE_DESTROY);
			this.stage = null;
		}

		if (this.root) {
			this.dispatchEvent(FlashCanvasManager.Events.ROOT_DESTROY);
			this.root = null;
		}
	};

	FlashCanvasManager.prototype.dispose = function() {
		this._isDisposed = true;
	};

	// See http://www.createjs.com/Docs/EaselJS/classes/EventDispatcher.html
	createjs.EventDispatcher.initialize(FlashCanvasManager.prototype);

	function MoviesCache() {
		this._cache = {};
	}

	/**
	 *
	 * @param {String} id
	 * @param {Object} lib
	 * @param {Object} images
	 */
	MoviesCache.prototype.add = function(id, lib, images) {
		if (lib != null && typeof lib === 'object') {
			this._cache[id] = {lib: lib, images: images || {}};
		} else {
			throw 'Invalid "movie" parameter type. CreateJS library expected.';
		}
	};

	/**
	 * @param {String} id
	 * @returns {Boolean}
	 */
	MoviesCache.prototype.contains = function(id) {
		return this._cache[id] != null; // jshint ignore:line
	};

	/**
	 * @param {String} id
	 * @returns {MoveClip}
	 */
	MoviesCache.prototype.get = function(id) { return this._cache[id]; };

	/**
	 * @param {String} id
	 */
	MoviesCache.prototype.remove = function(id) {
		if (this._cache[id]) {
			delete this._cache[id];
		}
	};

	MoviesCache.prototype.clear = function() {
		this._cache = {};
	};

	window.createjsUtil = window.createjsUtil || {};
	window.createjsUtil.FlashCanvasManager = FlashCanvasManager;
	window.createjsUtil.MoviesCache = MoviesCache;
}) (window);