// i18next, v1.7.2
// Copyright (c)2014 Jan Mühlemann (jamuhl).
// Distributed under MIT license
// http://i18next.com
/*
 * !Newbee modified:
 *   1. removed Array indexOf lastIndexOf for ecma5shiv has done it
 *   2. removed fallback _each, _extend, _ajax methods
 *   3. removed $.i18n, $.fn.i18n, Zepto.i18n
 *   4. add option contextSeparator, pluralSeparator
 */
(function($) {
"use strict";

var i18n = {},
	resStore = {},
	currentLng,
	replacementCounter = 0,
	languages = [],
	initialized = false,
	o = {// defaults
		lng: undefined,
		load: "all",
		preload: [],
		lowerCaseLng: false,
		returnObjectTrees: false,
		fallbackLng: "dev",
		fallbackNS: [],
		detectLngQS: "setLng",
		ns: "translation",
		fallbackOnNull: true,
		fallbackOnEmpty: false,
		fallbackToDefaultNS: false,
		nsseparator: ":",
		keyseparator: ".",
		contextSeparator: "_",// added by Newbee
		pluralSeparator: "_",// added by Newbee
		selectorAttr: "data-i18n",
		debug: false,
		
		resGetPath: "locales/__lng__/__ns__.json",
		resPostPath: "locales/add/__lng__/__ns__",
		
		getAsync: true,
		postAsync: true,
		
		resStore: undefined,
		useLocalStorage: false,
		localStorageExpirationTime: 7 * 24 * 60 * 60 * 1000,
		
		dynamicLoad: false,
		sendMissing: false,
		sendMissingTo: "fallback",// current | all
		sendType: "POST",
		
		interpolationPrefix: "__",
		interpolationSuffix: "__",
		reusePrefix: "$t(",
		reuseSuffix: ")",
		pluralSuffix: "_plural",
		pluralNotFound: ["plural_not_found", Math.random()].join(""),
		contextNotFound: ["context_not_found", Math.random()].join(""),
		escapeInterpolation: false,
		
		defaultValueFromContent: true,
		useDataAttrOptions: false,
		cookieExpirationTime: undefined,
		useCookie: true,
		cookieName: "i18next",
		cookieDomain: undefined,
		
		objectTreeKeyHandler: undefined,
		postProcess: undefined,
		parseMissingKey: undefined,
		
		shortcutFunction: "sprintf"// or: defaultValue
	},
	ENTITY_MAP = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;",
		"/": "&#x2F;"
	};

// move dependent functions to a container so that they can be overriden easier
var f = {
	extend: $.extend,
	each: $.each,
	ajax: $.ajax,
	detectLanguage: detectLanguage,
	
	cookie: {
		create: function(name, value, minutes, domain) {
			var expires;
			if (minutes) {
				var date = new Date();
				date.setTime(date.getTime() + (minutes * 60 * 1000));
				expires = "; expires=" + date.toGMTString();
			} else {
				expires = "";
			}
			domain = (domain)? "domain=" + domain + ";" : "";
			document.cookie = name + "=" + value + expires + ";" + domain + "path=/";
		},
		
		read: function(name) {
			var nameEQ = name + "=",
				ca = document.cookie.split(";");
			
			for (var i = 0; i < ca.length; i++) {
				var c = ca[i];
				while (c.charAt(0) === " ") {
					c = c.substring(1, c.length);
				}
				if (c.indexOf(nameEQ) === 0) {
					return c.substring(nameEQ.length, c.length);
				}
			}
			
			return null;
		},
		
		remove: function(name) {
			this.create(name, "", -1);
		}
	},
	
	escape: function(data) {
		if (typeof data === "string") {
			return data.replace(/[&<>"'\/]/g, function(s) {
				return ENTITY_MAP[s];
			});
		}
		
		return data;
	},
	
	log: function(str) {
		if (o.debug && typeof console !== "undefined") {
			console.log("[i18next] " + str);
		}
	},
	
	toLanguages: function(lng) {
		var languages = [];
		if (typeof lng === "string" && lng.indexOf("-") > -1) {
			var parts = lng.split("-");
			
			lng = o.lowerCaseLng ?
				parts[0].toLowerCase() + "-" + parts[1].toLowerCase() :
				parts[0].toLowerCase() + "-" + parts[1].toUpperCase();
			
			if (o.load !== "unspecific") {
				languages.push(lng);
			}
			if (o.load !== "current") {
				languages.push(parts[0]);
			}
		} else {
			languages.push(lng);
		}
		
		if (languages.indexOf(o.fallbackLng) === -1 && o.fallbackLng) {
			languages.push(o.fallbackLng);
		}
		
		return languages;
	},
	regexEscape: function(str) {
		return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	}
};
function init(options, cb) {
	if (typeof options === "function") {
		cb = options;
		options = {};
	}
	options = options || {};
	
	// override defaults with passed in options
	f.extend(o, options);
	delete o.fixLng; /* passed in each time */
	
	// create namespace object if namespace is passed in as string
	if (typeof o.ns === "string") {
		o.ns = {
			namespaces: [o.ns],
			defaultNs: o.ns
		};
	}
	
	// fallback namespaces
	if (typeof o.fallbackNS === "string") {
		o.fallbackNS = [o.fallbackNS];
	}
	
	// escape prefix/suffix
	o.interpolationPrefixEscaped = f.regexEscape(o.interpolationPrefix);
	o.interpolationSuffixEscaped = f.regexEscape(o.interpolationSuffix);
	
	if (!o.lng) {
		o.lng = f.detectLanguage();
	}
	if (o.lng) {// set cookie with lng set (as detectLanguage will set cookie on need)
		if (o.useCookie) {
			f.cookie.create(o.cookieName, o.lng, o.cookieExpirationTime, o.cookieDomain);
		}
	} else {
		o.lng = o.fallbackLng;
		if (o.useCookie) {
			f.cookie.remove(o.cookieName);
		}
	}
	
	languages = f.toLanguages(o.lng);
	currentLng = languages[0];
	f.log("currentLng set to: " + currentLng);
	
	var lngTranslate = translate;
	if (options.fixLng) {
		lngTranslate = function(key, options) {
			options = options || {};
			options.lng = options.lng || lngTranslate.lng;
			return translate(key, options);
		};
		lngTranslate.lng = currentLng;
	}
	
	pluralExtensions.setCurrentLng(currentLng);
	
	// jQuery deferred
	var deferred;
	if ($ && $.Deferred) {
		deferred = $.Deferred();
	}
	
	// return immediately if res are passed in
	if (o.resStore) {
		resStore = o.resStore;
		initialized = true;
		if (cb) {
			cb(lngTranslate);
		}
		if (deferred) {
			deferred.resolve(lngTranslate);
		}
		if (deferred) {
			return deferred.promise();
		}
		return;
	}
	
	// languages to load
	var lngsToLoad = f.toLanguages(o.lng);
	if (typeof o.preload === "string") {
		o.preload = [o.preload];
	}
	for (var i = 0, l = o.preload.length; i < l; i++) {
		var pres = f.toLanguages(o.preload[i]);
		for (var y = 0, len = pres.length; y < len; y++) {
			if (lngsToLoad.indexOf(pres[y]) < 0) {
				lngsToLoad.push(pres[y]);
			}
		}
	}
	
	// else load them
	i18n.sync.load(lngsToLoad, o, function(err, store) {
		resStore = store;
		initialized = true;
		
		if (cb) {
			cb(lngTranslate);
		}
		if (deferred) {
			deferred.resolve(lngTranslate);
		}
	});
	
	if (deferred) {
		return deferred.promise();
	}
}
function preload(lngs, cb) {
	if (typeof lngs === "string") {
		lngs = [lngs];
	}
	for (var i = 0, l = lngs.length; i < l; i++) {
		if (o.preload.indexOf(lngs[i]) < 0) {
			o.preload.push(lngs[i]);
		}
	}
	return init(cb);
}

function addResourceBundle(lng, ns, resources) {
	if (typeof ns !== "string") {
		resources = ns;
		ns = o.ns.defaultNs;
	} else if (o.ns.namespaces.indexOf(ns) < 0) {
		o.ns.namespaces.push(ns);
	}
	
	resStore[lng] = resStore[lng] || {};
	resStore[lng][ns] = resStore[lng][ns] || {};
	
	f.extend(resStore[lng][ns], resources);
}

function removeResourceBundle(lng, ns) {
	if (typeof ns !== "string") {
		ns = o.ns.defaultNs;
	}
	
	resStore[lng] = resStore[lng] || {};
	resStore[lng][ns] = {};
}

function setDefaultNamespace(ns) {
	o.ns.defaultNs = ns;
}

function loadNamespace(namespace, cb) {
	loadNamespaces([namespace], cb);
}

function loadNamespaces(namespaces, cb) {
	var opts = {
		dynamicLoad: o.dynamicLoad,
		resGetPath: o.resGetPath,
		getAsync: o.getAsync,
		customLoad: o.customLoad,
		ns: {// new namespaces to load
			namespaces: namespaces,
			defaultNs: ""
		}
	};
	
	// languages to load
	var lngsToLoad = f.toLanguages(o.lng);
	if (typeof o.preload === "string") {
		o.preload = [o.preload];
	}
	for (var i = 0, l = o.preload.length; i < l; i++) {
		var pres = f.toLanguages(o.preload[i]);
		for (var y = 0, len = pres.length; y < len; y++) {
			if (lngsToLoad.indexOf(pres[y]) < 0) {
				lngsToLoad.push(pres[y]);
			}
		}
	}
	
	// check if we have to load
	var lngNeedLoad = [];
	for (var a = 0, lenA = lngsToLoad.length; a < lenA; a++) {
		var needLoad = false,
			resSet = resStore[lngsToLoad[a]];
		
		if (resSet) {
			for (var b = 0, lenB = namespaces.length; b < lenB; b++) {
				if (!resSet[namespaces[b]]) {
					needLoad = true;
				}
			}
		} else {
			needLoad = true;
		}
		
		if (needLoad) {
			lngNeedLoad.push(lngsToLoad[a]);
		}
	}
	
	if (lngNeedLoad.length) {
		i18n.sync._fetch(lngNeedLoad, opts, function(err, store) {
			var todo = namespaces.length * lngNeedLoad.length;
			
			// load each file individual
			f.each(namespaces, function(nsIndex, nsValue) {
				// append namespace to namespace array
				if (o.ns.namespaces.indexOf(nsValue) < 0) {
					o.ns.namespaces.push(nsValue);
				}
				
				f.each(lngNeedLoad, function(lngIndex, lngValue) {
					resStore[lngValue] = resStore[lngValue] || {};
					resStore[lngValue][nsValue] = store[lngValue][nsValue];
					
					todo--;// wait for all done befor callback
					if (todo === 0 && cb) {
						if (o.useLocalStorage) {
							i18n.sync._storeLocal(resStore);
						}
						cb();
					}
				});
			});
		});
	} else {
		if (cb) {
			cb();
		}
	}
}

function setLng(lng, options, cb) {
	if (typeof options === "function") {
		cb = options;
		options = {};
	} else if (!options) {
		options = {};
	}
	
	options.lng = lng;
	return init(options, cb);
}

function lng() {
	return currentLng;
}

function applyReplacement(str, replacementHash, nestedKey, options) {
	if (!str) {
		return str;
	}
	
	options = options || replacementHash;// first call uses replacement hash combined with options
	if (str.indexOf(options.interpolationPrefix || o.interpolationPrefix) < 0) {
		return str;
	}
	var prefix = options.interpolationPrefix ? f.regexEscape(options.interpolationPrefix) : o.interpolationPrefixEscaped,
		suffix = options.interpolationSuffix ? f.regexEscape(options.interpolationSuffix) : o.interpolationSuffixEscaped,
		unEscapingSuffix = "HTML" + suffix;
	
	f.each(replacementHash, function(key, value) {
		if (key === "resStore") {
			return;
		}
		var nextKey = nestedKey ? nestedKey + o.keyseparator + key : key;
		if (typeof value === "object" && value !== null) {
			str = applyReplacement(str, value, nextKey, options);
		} else {
			if (options.escapeInterpolation || o.escapeInterpolation) {
				str = str.replace(new RegExp([prefix, nextKey, unEscapingSuffix].join(""), "g"), value);
				str = str.replace(new RegExp([prefix, nextKey, suffix].join(""), "g"), f.escape(value));
			} else {
				str = str.replace(new RegExp([prefix, nextKey, suffix].join(""), "g"), value);
			}
			// str = options.escapeInterpolation;
		}
	});
	
	return str;
}

// append it to functions
f.applyReplacement = applyReplacement;

function applyReuse(translated, options) {
	var comma = ",",
		optionsOpen = "{",
		optionsClose = "}",
		opts = f.extend({}, options);
	
	delete opts.postProcess;
	
	while (translated.indexOf(o.reusePrefix) !== -1) {
		replacementCounter++;
		if (replacementCounter > o.maxRecursion) {// safety net for too much recursion
			break;
		}
		
		var indexOfOpening = translated.lastIndexOf(o.reusePrefix),
			indexOfEndOfClosing = translated.indexOf(o.reuseSuffix, indexOfOpening) + o.reuseSuffix.length,
			token = translated.substring(indexOfOpening, indexOfEndOfClosing),
			tokenWithoutSymbols = token.replace(o.reusePrefix, "").replace(o.reuseSuffix, "");
		
		if (tokenWithoutSymbols.indexOf(comma) !== -1) {
			var indexOfTokenEndOfClosing = tokenWithoutSymbols.indexOf(comma);
			if (tokenWithoutSymbols.indexOf(optionsOpen, indexOfTokenEndOfClosing) !== -1 && tokenWithoutSymbols.indexOf(optionsClose, indexOfTokenEndOfClosing) !== -1) {
				var indexOfOptsOpening = tokenWithoutSymbols.indexOf(optionsOpen, indexOfTokenEndOfClosing),
					indexOfOptsEndOfClosing = tokenWithoutSymbols.indexOf(optionsClose, indexOfOptsOpening) + optionsClose.length;
				
				try {
					opts = f.extend(opts, JSON.parse(tokenWithoutSymbols.substring(indexOfOptsOpening, indexOfOptsEndOfClosing)));
					tokenWithoutSymbols = tokenWithoutSymbols.substring(0, indexOfTokenEndOfClosing);
				} catch (ex) {}
			}
		}
		
		translated = translated.replace(token, _translate(tokenWithoutSymbols, opts));
	}
	return translated;
}

function hasContext(options) {
	return (options.context && (typeof options.context === "string" || typeof options.context === "number"));
}

function needsPlural(options) {
	return (options.count !== undefined && typeof options.count !== "string" && options.count !== 1);
}

function exists(key, options) {
	options = options || {};
	
	var notFound = _getDefaultValue(key, options),
		found = _find(key, options);
	
	return found !== undefined || found === notFound;
}

function translate(key, options) {
	options = options || {};
	
	if (!initialized) {
		f.log("i18next not finished initialization. you might have called t function before loading resources finished.");
		return options.defaultValue || "";
	}
	replacementCounter = 0;
	return _translate.apply(null, arguments);
}

function _getDefaultValue(key, options) {
	return (options.defaultValue !== undefined) ? options.defaultValue : key;
}

function _injectSprintfProcessor() {
	var values = [];
	
	// mh: build array from second argument onwards
	for (var i = 1; i < arguments.length; i++) {
		values.push(arguments[i]);
	}
	
	return {
		postProcess: "sprintf",
		sprintf: values
	};
}

function _translate(potentialKeys, options) {
	if (typeof options === "string") {
		if (o.shortcutFunction === "sprintf") {
			// mh: gettext like sprintf syntax found, automatically create sprintf processor
			options = _injectSprintfProcessor.apply(null, arguments);
		} else if (o.shortcutFunction === "defaultValue") {
			options = {
				defaultValue: options
			};
		}
	} else {
		options = options || {};
	}
	
	if (potentialKeys === undefined || potentialKeys === null) {
		return "";
	}
	
	if (typeof potentialKeys === "string") {
		potentialKeys = [potentialKeys];
	}
	
	var key = potentialKeys[0];
	
	if (potentialKeys.length > 1) {
		for (var i = 0; i < potentialKeys.length; i++) {
			key = potentialKeys[i];
			if (exists(key)) {
				break;
			}
		}
	}
	
	var notFound = _getDefaultValue(key, options),
		found = _find(key, options),
		lngs = options.lng ? f.toLanguages(options.lng) : languages,
		ns = options.ns || o.ns.defaultNs,
		parts;
	
	// split ns and key
	if (key.indexOf(o.nsseparator) > -1) {
		parts = key.split(o.nsseparator);
		ns = parts[0];
		key = parts[1];
	}
	
	if (found === undefined && o.sendMissing) {
		if (options.lng) {
			sync.postMissing(lngs[0], ns, key, notFound, lngs);
		} else {
			sync.postMissing(o.lng, ns, key, notFound, lngs);
		}
	}
	
	var postProcessor = options.postProcess || o.postProcess;
	if (found !== undefined && postProcessor) {
		if (postProcessors[postProcessor]) {
			found = postProcessors[postProcessor](found, key, options);
		}
	}
	
	// process notFound if function exists
	var splitNotFound = notFound;
	if (notFound.indexOf(o.nsseparator) > -1) {
		parts = notFound.split(o.nsseparator);
		splitNotFound = parts[1];
	}
	if (splitNotFound === key && o.parseMissingKey) {
		notFound = o.parseMissingKey(notFound);
	}
	
	if (found === undefined) {
		notFound = applyReplacement(notFound, options);
		notFound = applyReuse(notFound, options);
		
		if (postProcessor && postProcessors[postProcessor]) {
			found = postProcessors[postProcessor](_getDefaultValue(key, options), key, options);
		}
	}
	
	return found !== undefined ? found : notFound;
}

function _find(key, options) {
	options = options || {};
	
	var notFound = _getDefaultValue(key, options),
		lngs = languages,
		optionWithoutCount, translated;
	
	if (!resStore) {// no resStore to translate from
		return notFound;
	}
	
	if (options.lng) {
		lngs = f.toLanguages(options.lng);
		
		if (!resStore[lngs[0]]) {
			var oldAsync = o.getAsync;
			o.getAsync = false;
			
			i18n.sync.load(lngs, o, function(err, store) {
				f.extend(resStore, store);
				o.getAsync = oldAsync;
			});
		}
	}
	
	var ns = options.ns || o.ns.defaultNs;
	if (key.indexOf(o.nsseparator) > -1) {
		var parts = key.split(o.nsseparator);
		ns = parts[0];
		key = parts[1];
	}
	
	if (hasContext(options)) {
		optionWithoutCount = f.extend({}, options);
		delete optionWithoutCount.context;
		optionWithoutCount.defaultValue = o.contextNotFound;
		
		var contextKey = ns + o.nsseparator + key + o.contextSeparator + options.context;
		
		translated = translate(contextKey, optionWithoutCount);
		if (translated != o.contextNotFound) {
			return applyReplacement(translated, {// apply replacement for context only
				context: options.context
			});
		}// else continue translation with original/nonContext key
	}
	
	if (needsPlural(options)) {
		optionWithoutCount = f.extend({}, options);
		delete optionWithoutCount.count;
		optionWithoutCount.defaultValue = o.pluralNotFound;
		
		var pluralKey = ns + o.nsseparator + key + o.pluralSuffix,
			pluralExtension = pluralExtensions.get(lngs[0], options.count);
		
		if (pluralExtension >= 0) {
			pluralKey = pluralKey + o.pluralSeparator + pluralExtension;
		} else if (pluralExtension === 1) {
			pluralKey = ns + o.nsseparator + key;// singular
		}
		
		translated = translate(pluralKey, optionWithoutCount);
		if (translated != o.pluralNotFound) {
			return applyReplacement(translated, {
				count: options.count,
				interpolationPrefix: options.interpolationPrefix,
				interpolationSuffix: options.interpolationSuffix
			});// apply replacement for count only
		}// else continue translation with original/singular key
	}
	
	var keys = key.split(o.keyseparator),
		found;
	
	for (var i = 0, len = lngs.length; i < len; i++) {
		if (found !== undefined) {
			break;
		}
		
		var l = lngs[i],
			x = 0,
			value = resStore[l] && resStore[l][ns];
		
		while (keys[x]) {
			value = value && value[keys[x]];
			x++;
		}
		if (value !== undefined) {
			var valueType = Object.prototype.toString.apply(value);
			if (typeof value === "string") {
				value = applyReplacement(value, options);
				value = applyReuse(value, options);
			} else if (valueType === "[object Array]" && !o.returnObjectTrees && !options.returnObjectTrees) {
				value = value.join("\n");
				value = applyReplacement(value, options);
				value = applyReuse(value, options);
			} else if (value === null && o.fallbackOnNull === true) {
				value = undefined;
			} else if (value !== null) {
				if (!o.returnObjectTrees && !options.returnObjectTrees) {
					if (o.objectTreeKeyHandler && typeof o.objectTreeKeyHandler === "function") {
						value = o.objectTreeKeyHandler(key, value, l, ns, options);
					} else {
						value = "key \"" + ns + ":" + key + " (" + l + ")\" returned an object instead of string.";
						f.log(value);
					}
				} else if (valueType !== "[object Number]" && valueType !== "[object Function]" && valueType !== "[object RegExp]") {
					var copy = (valueType === "[object Array]") ? [] : {};// apply child translation on a copy
					f.each(value, function(m) {
						copy[m] = _translate(ns + o.nsseparator + key + o.keyseparator + m, options);
					});
					value = copy;
				}
			}
			
			if (typeof value === "string" && value.trim() === "" && o.fallbackOnEmpty === true) {
				value = undefined;
			}
			
			found = value;
		}
	}
	
	if (found === undefined && !options.isFallbackLookup && (o.fallbackToDefaultNS === true || (o.fallbackNS && o.fallbackNS.length > 0))) {
		// set flag for fallback lookup - avoid recursion
		options.isFallbackLookup = true;
		
		if (o.fallbackNS.length) {
			for (var y = 0, lenY = o.fallbackNS.length; y < lenY; y++) {
				found = _find(o.fallbackNS[y] + o.nsseparator + key, options);
				
				if (found) {
					/* compare value without namespace */
					var foundValue = found.indexOf(o.nsseparator) > -1 ? found.split(o.nsseparator)[1] : found,
						notFoundValue = notFound.indexOf(o.nsseparator) > -1 ? notFound.split(o.nsseparator)[1] : notFound;
					
					if (foundValue !== notFoundValue) {
						break;
					}
				}
			}
		} else {
			found = _find(key, options);// fallback to default NS
		}
	}
	
	return found;
}
function detectLanguage() {
	var detectedLng;
	
	// get from qs
	var qsParam = [];
	if (typeof window !== "undefined") {
		(function() {
			var query = window.location.search.substring(1),
				params = query.split("&");
			
			for (var i = 0; i < params.length; i++) {
				var pos = params[i].indexOf("=");
				if (pos > 0) {
					qsParam[params[i].substring(0, pos)] = params[i].substring(pos + 1);
				}
			}
		})();
		
		if (qsParam[o.detectLngQS]) {
			detectedLng = qsParam[o.detectLngQS];
		}
	}
	
	// get from cookie
	if (!detectedLng && typeof document !== "undefined" && o.useCookie) {
		var c = f.cookie.read(o.cookieName);
		if (c) {
			detectedLng = c;
		}
	}
	
	// get from navigator
	if (!detectedLng && typeof navigator !== "undefined") {
		detectedLng = (navigator.language) ? navigator.language : navigator.userLanguage;
	}
	
	return detectedLng;
}

var sync = {
	load: function(lngs, options, cb) {
		if (options.useLocalStorage) {
			sync._loadLocal(lngs, options, function(err, store) {
				var missingLngs = [];
				for (var i = 0, len = lngs.length; i < len; i++) {
					if (!store[lngs[i]]) {
						missingLngs.push(lngs[i]);
					}
				}
				
				if (missingLngs.length > 0) {
					sync._fetch(missingLngs, options, function(err, fetched) {
						f.extend(store, fetched);
						sync._storeLocal(fetched);
						
						cb(null, store);
					});
				} else {
					cb(null, store);
				}
			});
		} else {
			sync._fetch(lngs, options, function(err, store) {
				cb(null, store);
			});
		}
	},
	
	_loadLocal: function(lngs, options, cb) {
		var store = {},
			nowMS = new Date().getTime();
		
		if (window.localStorage) {
			var todo = lngs.length;
			
			f.each(lngs, function(key, lng) {
				var local = window.localStorage.getItem("res_" + lng);
				
				if (local) {
					local = JSON.parse(local);
					
					if (local.i18nStamp && local.i18nStamp + options.localStorageExpirationTime > nowMS) {
						store[lng] = local;
					}
				}
				
				todo--;// wait for all done befor callback
				if (todo === 0) {
					cb(null, store);
				}
			});
		}
	},
	
	_storeLocal: function(store) {
		if (window.localStorage) {
			for (var m in store) {
				store[m].i18nStamp = new Date().getTime();
				window.localStorage.setItem("res_" + m, JSON.stringify(store[m]));
			}
		}
	},
	
	_fetch: function(lngs, options, cb) {
		var ns = options.ns,
			store = {};
		
		if (!options.dynamicLoad) {
			var todo = ns.namespaces.length * lngs.length,
				errors;
			
			// load each file individual
			f.each(ns.namespaces, function(nsIndex, nsValue) {
				f.each(lngs, function(lngIndex, lngValue) {
					// Call this once our translation has returned.
					var loadComplete = function(err, data) {
						if (err) {
							errors = errors || [];
							errors.push(err);
						}
						store[lngValue] = store[lngValue] || {};
						store[lngValue][nsValue] = data;
						
						todo--;// wait for all done before callback
						if (todo === 0) {
							cb(errors, store);
						}
					};
					
					if (typeof options.customLoad === "function") {
						// Use the specified custom callback
						options.customLoad(lngValue, nsValue, options, loadComplete, url);
					} else {
						//~// Use our inbuilt sync
						sync._fetchOne(lngValue, nsValue, options, loadComplete);
					}
				});
			});
		} else {// Call this once our translation has returned
			var loadComplete = function(err, data) {
				cb(null, data);
			};
			
			if (typeof options.customLoad === "function") {
				// Use the specified custom callback.
				options.customLoad(lngs, ns.namespaces, options, loadComplete);
			} else {
				var url = applyReplacement(options.resGetPath, {
					lng: lngs.join("+"), ns: ns.namespaces.join("+")
				});
				
				f.ajax({// load all needed stuff once
					url: url,
					success: function(data/*, status, xhr*/) {
						f.log("loaded: " + url);
						loadComplete(null, data);
					},
					error: function(xhr, status, error) {
						f.log("failed loading: " + url);
						loadComplete("failed loading resource.json error: " + error);
					},
					dataType: "json",
					async: options.getAsync
				});
			}
		}
	},
	
	_fetchOne: function(lng, ns, options, done) {
		var url = applyReplacement(options.resGetPath, {
			lng: lng,
			ns: ns
		});
		// --- Newbee: customUrl support
		if (typeof options.customUrl === "function") {
			url = options.customUrl(lng, ns, url);
		}
		// Newbee: customUrl support ---
		f.ajax({
			url: url,
			success: function(data/*, status, xhr*/) {
				f.log("loaded: " + url);
				done(null, data);
			},
			error: function(xhr, status, error) {
				if (error.status === 200) {
					f.log("loaded but invalid JSON file \"" + url + "\"");// file loaded but invalid json, stop wasting time!
				} else if (error.status === 404) {
					f.log("non-exist url \"" + url + "\"");
				} else {
					f.log("error loading \"" + url + "\" " + status + ":" + (error && error.message));
				}
				
				done(error, {});
			},
			dataType: "json",
			async: options.getAsync
		});
	},
	
	postMissing: function(lng, ns, key, defaultValue, lngs) {
		var payload = {},
			urls = [];
		
		payload[key] = defaultValue;
		
		if (o.sendMissingTo === "fallback" && o.fallbackLng !== false) {
			urls.push({
				lng: o.fallbackLng,
				url: applyReplacement(o.resPostPath, {
					lng: o.fallbackLng,
					ns: ns
				})
			});
		} else if (o.sendMissingTo === "current" || (o.sendMissingTo === "fallback" && o.fallbackLng === false)) {
			urls.push({
				lng: lng,
				url: applyReplacement(o.resPostPath, {
					lng: lng,
					ns: ns
				})
			});
		} else if (o.sendMissingTo === "all") {
			for (var i = 0, l = lngs.length; i < l; i++) {
				urls.push({
					lng: lngs[i],
					url: applyReplacement(o.resPostPath, {
						lng: lngs[i],
						ns: ns
					})
				});
			}
		}
		
		for (var y = 0, len = urls.length; y < len; y++) {
			var item = urls[y];
			f.ajax({
				url: item.url,
				type: o.sendType,
				data: payload,
				success: function(/*data, status, xhr*/) {
					f.log("posted missing key \"" + key + "\" to: " + item.url);
					
					// add key to resStore
					var keys = key.split("."),
						x = 0,
						value = resStore[item.lng][ns];
					
					while (keys[x]) {
						if (x === keys.length - 1) {
							value = value[keys[x]] = defaultValue;
						} else {
							value = value[keys[x]] = value[keys[x]] || {};
						}
						x++;
					}
				},
				error: function(/*xhr, status, error*/) {
					f.log("failed posting missing key \"" + key + "\" to: " + item.url);
				},
				dataType: "json",
				async: o.postAsync
			});
		}
	}
};
// definition http://translate.sourceforge.net/wiki/l10n/pluralforms
var pluralExtensions = {
	rules: {
		ach: {
			name: "Acholi",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		af: {
			name: "Afrikaans",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ak: {
			name: "Akan",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		am: {
			name: "Amharic",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		an: {
			name: "Aragonese",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ar: {
			name: "Arabic",
			numbers: [0, 1, 2, 3, 11, 100],
			plurals: function(n) {
				return Number(n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n % 100 >= 3 && n % 100 <= 10 ? 3 : n % 100 >= 11 ? 4 : 5);
			}
		},
		arn: {
			name: "Mapudungun",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		ast: {
			name: "Asturian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ay: {
			name: "Aymar\u00e1",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		az: {
			name: "Azerbaijani",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		be: {
			name: "Belarusian",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number(n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		bg: {
			name: "Bulgarian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		bn: {
			name: "Bengali",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		bo: {
			name: "Tibetan",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		br: {
			name: "Breton",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		bs: {
			name: "Bosnian",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number(n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		ca: {
			name: "Catalan",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		cgg: {
			name: "Chiga",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		cs: {
			name: "Czech",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number((n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2);
			}
		},
		csb: {
			name: "Kashubian",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number(n==1 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		cy: {
			name: "Welsh",
			numbers: [1, 2, 3, 8],
			plurals: function(n) {
				return Number(n === 1 ? 0 : n === 2 ? 1 : (n !== 8 && n !== 11) ? 2 : 3);
			}
		},
		da: {
			name: "Danish",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		de: {
			name: "German",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		dz: {
			name: "Dzongkha",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		el: {
			name: "Greek",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		en: {
			name: "English",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		eo: {
			name: "Esperanto",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		es: {
			name: "Spanish",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		es_ar: {
			name: "Argentinean Spanish",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		et: {
			name: "Estonian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		eu: {
			name: "Basque",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		fa: {
			name: "Persian",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		fi: {
			name: "Finnish",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		fil: {
			name: "Filipino",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		fo: {
			name: "Faroese",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		fr: {
			name: "French",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		fur: {
			name: "Friulian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		fy: {
			name: "Frisian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ga: {
			name: "Irish",
			numbers: [1, 2, 3, 7, 11],
			plurals: function(n) {
				return Number(n === 1 ? 0 : n === 2 ? 1 : n < 7 ? 2 : n < 11 ? 3 : 4);
			}
		},
		gd: {
			name: "Scottish Gaelic",
			numbers: [
				1,
				2,
				3,
				20
			],
			plurals: function(n) {
				return Number((n === 1 || n === 11) ? 0 : (n === 2 || n === 12) ? 1 : (n > 2 && n < 20) ? 2 : 3);
			}
		},
		gl: {
			name: "Galician",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		gu: {
			name: "Gujarati",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		gun: {
			name: "Gun",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		ha: {
			name: "Hausa",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		he: {
			name: "Hebrew",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		hi: {
			name: "Hindi",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		hr: {
			name: "Croatian",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number(n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		hu: {
			name: "Hungarian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		hy: {
			name: "Armenian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ia: {
			name: "Interlingua",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		id: {
			name: "Indonesian",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		is: {
			name: "Icelandic",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n%10!=1 || n % 100 === 11);
			}
		},
		it: {
			name: "Italian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ja: {
			name: "Japanese",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		jbo: {
			name: "Lojban",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		jv: {
			name: "Javanese",
			numbers: [0, 1],
			plurals: function(n) {
				return Number(n !== 0);
			}
		},
		ka: {
			name: "Georgian",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		kk: {
			name: "Kazakh",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		km: {
			name: "Khmer",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		kn: {
			name: "Kannada",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ko: {
			name: "Korean",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		ku: {
			name: "Kurdish",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		kw: {
			name: "Cornish",
			numbers: [1, 2, 3, 4],
			plurals: function(n) {
				return Number((n === 1) ? 0 : (n === 2) ? 1 : (n === 3) ? 2 : 3);
			}
		},
		ky: {
			name: "Kyrgyz",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		lb: {
			name: "Letzeburgesch",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ln: {
			name: "Lingala",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		lo: {
			name: "Lao",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		lt: {
			name: "Lithuanian",
			numbers: [1, 2, 10],
			plurals: function(n) {
				return Number(n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		lv: {
			name: "Latvian",
			numbers: [0, 1, 2],
			plurals: function(n) {
				return Number(n % 10 === 1 && n % 100 !== 11 ? 0 : n !== 0 ? 1 : 2);
			}
		},
		mai: {
			name: "Maithili",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		mfe: {
			name: "Mauritian Creole",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		mg: {
			name: "Malagasy",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		mi: {
			name: "Maori",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		mk: {
			name: "Macedonian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n==1 || n % 10 === 1 ? 0 : 1);
			}
		},
		ml: {
			name: "Malayalam",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		mn: {
			name: "Mongolian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		mnk: {
			name: "Mandinka",
			numbers: [0, 1, 2],
			plurals: function(n) {
				return Number(0 ? 0 : n === 1 ? 1 : 2);
			}
		},
		mr: {
			name: "Marathi",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ms: {
			name: "Malay",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		mt: {
			name: "Maltese",
			numbers: [1, 2, 11, 20],
			plurals: function(n) {
				return Number(n === 1 ? 0 : n === 0 || (n % 100 > 1 && n % 100 < 11) ? 1 : (n % 100 > 10 && n % 100 < 20) ? 2 : 3);
			}
		},
		nah: {
			name: "Nahuatl",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		nap: {
			name: "Neapolitan",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		nb: {
			name: "Norwegian Bokmal",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ne: {
			name: "Nepali",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		nl: {
			name: "Dutch",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		nn: {
			name: "Norwegian Nynorsk",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		no: {
			name: "Norwegian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		nso: {
			name: "Northern Sotho",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		oc: {
			name: "Occitan",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		or: {
			name: "Oriya",
			numbers: [2, 1],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		pa: {
			name: "Punjabi",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		pap: {
			name: "Papiamento",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		pl: {
			name: "Polish",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number(n === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		pms: {
			name: "Piemontese",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ps: {
			name: "Pashto",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		pt: {
			name: "Portuguese",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		pt_br: {
			name: "Brazilian Portuguese",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		rm: {
			name: "Romansh",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ro: {
			name: "Romanian",
			numbers: [1, 2, 20],
			plurals: function(n) {
				return Number(n === 1 ? 0 : (n === 0 || (n % 100 > 0 && n % 100 < 20)) ? 1 : 2);
			}
		},
		ru: {
			name: "Russian",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number(n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		sah: {
			name: "Yakut",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		sco: {
			name: "Scots",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		se: {
			name: "Northern Sami",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		si: {
			name: "Sinhala",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		sk: {
			name: "Slovak",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number((n === 1) ? 0 : (n >= 2 && n <= 4) ? 1 : 2);
			}
		},
		sl: {
			name: "Slovenian",
			numbers: [5, 1, 2, 3],
			plurals: function(n) {
				return Number(n % 100 === 1 ? 1 : n % 100 === 2 ? 2 : n % 100 === 3 || n % 100 === 4 ? 3 : 0);
			}
		},
		so: {
			name: "Somali",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		son: {
			name: "Songhay",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		sq: {
			name: "Albanian",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		sr: {
			name: "Serbian",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number(n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		su: {
			name: "Sundanese",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		sv: {
			name: "Swedish",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		sw: {
			name: "Swahili",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		ta: {
			name: "Tamil",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		te: {
			name: "Telugu",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		tg: {
			name: "Tajik",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		th: {
			name: "Thai",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		ti: {
			name: "Tigrinya",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		tk: {
			name: "Turkmen",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		tr: {
			name: "Turkish",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		tt: {
			name: "Tatar",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		ug: {
			name: "Uyghur",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		uk: {
			name: "Ukrainian",
			numbers: [1, 2, 5],
			plurals: function(n) {
				return Number(n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
			}
		},
		ur: {
			name: "Urdu",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		uz: {
			name: "Uzbek",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		vi: {
			name: "Vietnamese",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		wa: {
			name: "Walloon",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n > 1);
			}
		},
		wo: {
			name: "Wolof",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		},
		yo: {
			name: "Yoruba",
			numbers: [1, 2],
			plurals: function(n) {
				return Number(n !== 1);
			}
		},
		zh: {
			name: "Chinese",
			numbers: [1],
			plurals: function(n) {
				return 0;
			}
		}
	},
	
	// for demonstration only sl and ar is added but you can add your own pluralExtensions
	addRule: function(lng, obj) {
		pluralExtensions.rules[lng] = obj;
	},
	
	setCurrentLng: function(lng) {
		if (!pluralExtensions.currentRule || pluralExtensions.currentRule.lng !== lng) {
			var parts = lng.split("-");
			
			pluralExtensions.currentRule = {
				lng: lng,
				rule: pluralExtensions.rules[parts[0]]
			};
		}
	},
	
	get: function(lng, count) {
		var parts = lng.split("-");
		
		function getResult(l, c) {
			var ext;
			if (pluralExtensions.currentRule && pluralExtensions.currentRule.lng === lng) {
				ext = pluralExtensions.currentRule.rule;
			} else {
				ext = pluralExtensions.rules[l];
			}
			if (ext) {
				var i = ext.plurals(c),
					number = ext.numbers[i];
				
				if (ext.numbers.length === 2 && ext.numbers[0] === 1) {
					if (number === 2) {
						number = -1;// regular plural
					} else if (number === 1) {
						number = 1;// singular
					}
				}
				
				return number;
			}
			
			return c === 1 ? "1" : "-1";
		}
		
		return getResult(parts[0], count);
	}
};
var postProcessors = {};
var addPostProcessor = function(name, fc) {
	postProcessors[name] = fc;
};
// sprintf support
var sprintf = (function() {
	function getType(variable) {
		return Object.prototype.toString.call(variable).slice(8, -1).toLowerCase();
	}
	
	function strRepeat(input, multiplier) {
		for (var output = []; multiplier > 0; output[--multiplier] = input) {
			// do nothing
		}
		
		return output.join("");
	}
	
	var strFormat = function() {
		if (!strFormat.cache.hasOwnProperty(arguments[0])) {
			strFormat.cache[arguments[0]] = strFormat.parse(arguments[0]);
		}
		return strFormat.format.call(null, strFormat.cache[arguments[0]], arguments);
	};
	
	strFormat.format = function(parseTree, argv) {
		var cursor = 1,
			treeLength = parseTree.length,
			nodeType = "",
			output = [],
			arg, i, k, match, pad, padCharacter, padLength;
		
		for (i = 0; i < treeLength; i++) {
			nodeType = getType(parseTree[i]);
			if (nodeType === "string") {
				output.push(parseTree[i]);
			} else if (nodeType === "array") {
				match = parseTree[i];// convenience purposes only
				if (match[2]) {// keyword argument
					arg = argv[cursor];
					for (k = 0; k < match[2].length; k++) {
						if (!arg.hasOwnProperty(match[2][k])) {
							throw(sprintf("[sprintf] property \"%s\" does not exist", match[2][k]));
						}
						arg = arg[match[2][k]];
					}
				} else if (match[1]) {// positional argument (explicit)
					arg = argv[match[1]];
				} else {// positional argument (implicit)
					arg = argv[cursor++];
				}
				
				if (/[^s]/.test(match[8]) && getType(arg) !== "number") {
					throw(sprintf("[sprintf] expecting number but found %s", getType(arg)));
				}
				switch (match[8]) {
				case "b":
					arg = arg.toString(2);
					break;
				case "c":
					arg = String.fromCharCode(arg);
					break;
				case "d":
					arg = parseInt(arg, 10);
					break;
				case "e":
					arg = match[7] ? arg.toExponential(match[7]) : arg.toExponential();
					break;
				case "f":
					arg = match[7] ? parseFloat(arg).toFixed(match[7]) : parseFloat(arg);
					break;
				case "o":
					arg = arg.toString(8);
					break;
				case "s":
					arg = ((arg = String(arg)) && match[7] ? arg.substring(0, match[7]) : arg);
					break;
				case "u":
					arg = Math.abs(arg);
					break;
				case "x":
					arg = arg.toString(16);
					break;
				case "X":
					arg = arg.toString(16).toUpperCase();
					break;
				}
				arg = (/[def]/.test(match[8]) && match[3] && arg >= 0 ? "+" + arg : arg);
				padCharacter = match[4] ? match[4] === "0" ? "0" : match[4].charAt(1) : " ";
				padLength = match[6] - String(arg).length;
				pad = match[6] ? strRepeat(padCharacter, padLength) : "";
				output.push(match[5] ? arg + pad : pad + arg);
			}
		}
		return output.join("");
	};
	
	strFormat.cache = {};
	
	strFormat.parse = function(fmt) {
		var _fmt = fmt,
			match = [],
			parseTree = [],
			argNames = 0;
		
		while (_fmt) {
			if ((match = /^[^\x25]+/.exec(_fmt)) !== null) {
				parseTree.push(match[0]);
			} else if ((match = /^\x25{2}/.exec(_fmt)) !== null) {
				parseTree.push("%");
			} else if ((match = /^\x25(?:([1-9]\d*)\$|\(([^\)]+)\))?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-fosuxX])/.exec(_fmt)) !== null) {
				if (match[2]) {
					argNames |= 1;
					var fieldList = [],
						replacementField = match[2],
						fieldMatch = [];
					
					if ((fieldMatch = /^([a-z_][a-z_\d]*)/i.exec(replacementField)) === null) {
						throw("[sprintf] huh?");
					}
					
					fieldList.push(fieldMatch[1]);
					while ((replacementField = replacementField.substring(fieldMatch[0].length)) !== "") {
						if ((fieldMatch = /^\.([a-z_][a-z_\d]*)/i.exec(replacementField)) !== null) {
							fieldList.push(fieldMatch[1]);
						} else if ((fieldMatch = /^\[(\d+)\]/.exec(replacementField)) !== null) {
							fieldList.push(fieldMatch[1]);
						} else {
							throw("[sprintf] huh?");
						}
					}
					
					match[2] = fieldList;
				} else {
					argNames |= 2;
				}
				
				if (argNames === 3) {
					throw("[sprintf] mixing positional and named placeholders is not (yet) supported");
				}
				
				parseTree.push(match);
			} else {
				throw("[sprintf] huh?");
			}
			_fmt = _fmt.substring(match[0].length);
		}
		return parseTree;
	};
	
	return strFormat;
})();

var vsprintf = function(fmt, argv) {
	argv.unshift(fmt);
	return sprintf.apply(null, argv);
};

addPostProcessor("sprintf", function(val, key, opts) {
	if (!opts.sprintf) {
		return val;
	}
	
	if (Object.prototype.toString.apply(opts.sprintf) === "[object Array]") {
		return vsprintf(val, opts.sprintf);
	}
	
	if (typeof opts.sprintf === "object") {
		return sprintf(val, opts.sprintf);
	}
	
	return val;
});

// public api interface
i18n.init = init;
i18n.setLng = setLng;
i18n.preload = preload;
i18n.addResourceBundle = addResourceBundle;
i18n.removeResourceBundle = removeResourceBundle;
i18n.loadNamespace = loadNamespace;
i18n.loadNamespaces = loadNamespaces;
i18n.setDefaultNamespace = setDefaultNamespace;
i18n.translate = translate;
i18n.exists = exists;
i18n.detectLanguage = f.detectLanguage;
i18n.pluralExtensions = pluralExtensions;
i18n.sync = sync;
i18n.functions = f;
i18n.lng = lng;
i18n.addPostProcessor = addPostProcessor;
i18n.options = o;

// export
window.i18n = i18n;
})(jQuery);
