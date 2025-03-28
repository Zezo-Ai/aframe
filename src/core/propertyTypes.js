import * as coordinates from '../utils/coordinates.js';
import debug from 'debug';

var warn = debug('core:propertyTypes:warn');

export var propertyTypes = {};
var nonCharRegex = /[,> .[\]:]/;
var urlRegex = /url\((.+)\)/;

// Built-in property types.
registerPropertyType('audio', '', assetParse, assetStringify);
registerPropertyType('array', [], arrayParse, arrayStringify, arrayEquals);
registerPropertyType('asset', '', assetParse, assetStringify);
registerPropertyType('boolean', false, boolParse);
registerPropertyType('color', '#FFF');
registerPropertyType('int', 0, intParse);
registerPropertyType('number', 0, numberParse);
registerPropertyType('map', '', assetParse, assetStringify);
registerPropertyType('model', '', assetParse, assetStringify);
registerPropertyType('selector', null, selectorParse, selectorStringify, defaultEquals, false);
registerPropertyType('selectorAll', null, selectorAllParse, selectorAllStringify, arrayEquals, false);
registerPropertyType('src', '', srcParse, assetStringify);
registerPropertyType('string', '');
registerPropertyType('time', 0, intParse);
registerPropertyType('vec2', {x: 0, y: 0}, vecParse, coordinates.stringify, coordinates.equals);
registerPropertyType('vec3', {x: 0, y: 0, z: 0}, vecParse, coordinates.stringify, coordinates.equals);
registerPropertyType('vec4', {x: 0, y: 0, z: 0, w: 1}, vecParse, coordinates.stringify, coordinates.equals);

/**
 * Register a parser for re-use such that when someone uses `type` in the schema,
 * `schema.process` will set the property `parse` and `stringify`.
 *
 * @param {string} type - Type name.
 * @param {any} [defaultValue=null] - Default value to use if component does not define default value.
 * @param {function} [parse=defaultParse] - Parse string function.
 * @param {function} [stringify=defaultStringify] - Stringify to DOM function.
 * @param {function} [equals=defaultEquals] - Equality comparator.
 * @param {boolean} [cacheable=false] - Whether or not the parsed value of a property can be cached.
 */
export function registerPropertyType (type, defaultValue, parse, stringify, equals, cacheable) {
  if (type in propertyTypes) {
    throw new Error('Property type ' + type + ' is already registered.');
  }

  propertyTypes[type] = {
    default: defaultValue,
    parse: parse || defaultParse,
    stringify: stringify || defaultStringify,
    equals: equals || defaultEquals,
    isCacheable: cacheable !== false
  };
}

function arrayParse (value) {
  if (Array.isArray(value)) { return value; }
  if (!value || typeof value !== 'string') { return []; }
  return value.split(',').map(trim);
  function trim (str) { return str.trim(); }
}

function arrayStringify (value) {
  return value.join(', ');
}

function arrayEquals (a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return a === b;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (var i = 0; i < a.length; i++) {
    // FIXME: Deep-equals for objects?
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/**
 * For general assets.
 *
 * @param {string} value - Can either be `url(<value>)`, an ID selector to an asset, or
 *   just string.
 * @returns {string} Parsed value from `url(<value>)`, src from `<someasset src>`, or
 *   just string.
 */
function assetParse (value) {
  var el;
  var parsedUrl;

  // If an element was provided (e.g. canvas or video), just return it.
  if (typeof value !== 'string') { return value; }

  // Wrapped `url()` in case of data URI.
  parsedUrl = value.match(urlRegex);
  if (parsedUrl) { return parsedUrl[1]; }

  // ID.
  if (value.charAt(0) === '#') {
    el = document.getElementById(value.substring(1));
    if (el) {
      // Pass through media elements. If we have the elements, we don't have to call
      // three.js loaders which would re-request the assets.
      if (el.tagName === 'CANVAS' || el.tagName === 'VIDEO' || el.tagName === 'IMG') {
        return el;
      }
      return el.getAttribute('src');
    }
    warn('"' + value + '" asset not found.');
    return;
  }

  // Non-wrapped url().
  return value;
}

function assetStringify (value) {
  if (value.getAttribute) {
    var id = value.getAttribute('id');
    if (id) {
      return '#' + value.getAttribute('id');
    }
    // HTMLElement without id can not be stringified, as there is no string assetParse
    // could convert back to this exact element, using the src attribute instead.
    return value.getAttribute('src');
  }
  return defaultStringify(value);
}

function defaultParse (value) {
  return value;
}

function defaultStringify (value) {
  if (value === null) { return 'null'; }
  return value.toString();
}

function defaultEquals (a, b) {
  return a === b;
}

function boolParse (value) {
  return value !== 'false' && value !== false;
}

function intParse (value) {
  return parseInt(value, 10);
}

function numberParse (value) {
  return parseFloat(value, 10);
}

function selectorParse (value) {
  if (!value) { return null; }
  if (typeof value !== 'string') { return value; }
  if (value[0] === '#' && !nonCharRegex.test(value)) {
    // When selecting element by ID only, use getElementById for better performance.
    // Don't match like #myId .child.
    return document.getElementById(value.substring(1));
  }
  return document.querySelector(value);
}

function selectorAllParse (value) {
  if (!value) { return null; }
  if (typeof value !== 'string') { return value; }
  return Array.prototype.slice.call(document.querySelectorAll(value), 0);
}

function selectorStringify (value) {
  if (value.getAttribute) {
    return '#' + value.getAttribute('id');
  }
  return defaultStringify(value);
}

function selectorAllStringify (value) {
  if (value instanceof Array) {
    return value.map(function (element) {
      return '#' + element.getAttribute('id');
    }).join(', ');
  }
  return defaultStringify(value);
}

function srcParse (value) {
  warn('`src` property type is deprecated. Use `asset` instead.');
  return assetParse(value);
}

function vecParse (value, defaultValue, target) {
  return coordinates.parse(value, defaultValue, target);
}

/**
 * Validate the default values in a schema to match their type.
 *
 * @param {string} type - Property type name.
 * @param defaultVal - Property type default value.
 * @returns {boolean} Whether default value is accurate given the type.
 */
export function isValidDefaultValue (type, defaultVal) {
  if (type === 'audio' && typeof defaultVal !== 'string') { return false; }
  if (type === 'array' && !Array.isArray(defaultVal)) { return false; }
  if (type === 'asset' && typeof defaultVal !== 'string') { return false; }
  if (type === 'boolean' && typeof defaultVal !== 'boolean') { return false; }
  if (type === 'color' && typeof defaultVal !== 'string') { return false; }
  if (type === 'int' && typeof defaultVal !== 'number') { return false; }
  if (type === 'number' && typeof defaultVal !== 'number') { return false; }
  if (type === 'map' && typeof defaultVal !== 'string') { return false; }
  if (type === 'model' && typeof defaultVal !== 'string') { return false; }
  if (type === 'selector' && typeof defaultVal !== 'string' &&
      defaultVal !== null) { return false; }
  if (type === 'selectorAll' && typeof defaultVal !== 'string' &&
      defaultVal !== null) { return false; }
  if (type === 'src' && typeof defaultVal !== 'string') { return false; }
  if (type === 'string' && typeof defaultVal !== 'string') { return false; }
  if (type === 'time' && typeof defaultVal !== 'number') { return false; }
  if (type === 'vec2') { return isValidDefaultCoordinate(defaultVal, 2); }
  if (type === 'vec3') { return isValidDefaultCoordinate(defaultVal, 3); }
  if (type === 'vec4') { return isValidDefaultCoordinate(defaultVal, 4); }
  return true;
}

/**
 * Checks if default coordinates are valid.
 *
 * @param possibleCoordinates
 * @param {number} dimensions - 2 for 2D Vector, 3 for 3D vector.
 * @returns {boolean} Whether coordinates are parsed correctly.
 */
export function isValidDefaultCoordinate (possibleCoordinates, dimensions) {
  if (possibleCoordinates === null) { return true; }
  if (typeof possibleCoordinates !== 'object') { return false; }

  if (Object.keys(possibleCoordinates).length !== dimensions) {
    return false;
  } else {
    var x = possibleCoordinates.x;
    var y = possibleCoordinates.y;
    var z = possibleCoordinates.z;
    var w = possibleCoordinates.w;

    if (typeof x !== 'number' || typeof y !== 'number') { return false; }
    if (dimensions > 2 && typeof z !== 'number') { return false; }
    if (dimensions > 3 && typeof w !== 'number') { return false; }
  }

  return true;
}
