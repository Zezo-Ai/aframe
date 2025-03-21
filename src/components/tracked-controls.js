import { registerComponent } from '../core/component.js';
import * as controllerUtils from '../utils/tracked-controls.js';

var EVENTS = {
  AXISMOVE: 'axismove',
  BUTTONCHANGED: 'buttonchanged',
  BUTTONDOWN: 'buttondown',
  BUTTONUP: 'buttonup',
  TOUCHSTART: 'touchstart',
  TOUCHEND: 'touchend'
};

/**
 * Tracked controls.
 * Abstract controls to support 6DOF tracked input controllers.
 *
 * @property {string} id - String corresponding to the WebXR controller input profile ids.
 * @property {number} controller - Index of controller in array returned by Gamepad API.
 *  Only used if hand property is not set.
 * @property {boolean} autoHide - shows / hides the entity automatically when the controller is
 * connected or desconneted.
 * @property {number} hand - If multiple controllers found with id, choose the one with the
 *  given value for hand. If set, we ignore 'controller' property
 * @property {boolean} handTrackingEnabled - Assumes a controller exposed via the WebXR Hand Input Module.
 * @property {boolean} iterateControllerProfiles - Iterates over all of the WebXR controller input profiles.
 */
export var Component = registerComponent('tracked-controls', {
  schema: {
    id: {type: 'string', default: ''},
    controller: {default: -1},
    autoHide: {default: true},
    hand: {type: 'string', default: ''},
    handTrackingEnabled: {default: false},
    iterateControllerProfiles: {default: false}
  },

  init: function () {
    this.buttonEventDetails = {};
    this.buttonStates = this.el.components['tracked-controls'].buttonStates = {};
    this.axis = this.el.components['tracked-controls'].axis = [0, 0, 0];
    this.changedAxes = [];
    this.axisMoveEventDetail = {axis: this.axis, changed: this.changedAxes};

    this.updateController = this.updateController.bind(this);
  },

  update: function () {
    this.updateController();
  },

  play: function () {
    var sceneEl = this.el.sceneEl;
    this.updateController();
    sceneEl.addEventListener('controllersupdated', this.updateController);
  },

  pause: function () {
    var sceneEl = this.el.sceneEl;
    sceneEl.removeEventListener('controllersupdated', this.updateController);
  },

  isControllerPresent: function (evt) {
    if (!this.controller || this.controller.gamepad) { return false; }
    if (evt.inputSource.handedness !== 'none' &&
        evt.inputSource.handedness !== this.data.hand) {
      return false;
    }
    return true;
  },

  /**
   * Handle update controller match criteria (such as `id`, `idPrefix`, `hand`, `controller`)
   */
  updateController: function () {
    this.controller = controllerUtils.findMatchingControllerWebXR(
      this.system.controllers,
      this.data.id,
      this.data.hand,
      this.data.controller,
      this.data.iterateControllerProfiles,
      this.data.handTrackingEnabled
    );
    // Legacy handle to the controller for old components.
    this.el.components['tracked-controls'].controller = this.controller;
  },

  tick: function () {
    var sceneEl = this.el.sceneEl;
    var controller = this.controller;
    var frame = sceneEl.frame;
    if (this.data.autoHide) { this.el.object3D.visible = !!controller; }
    if (!controller || !sceneEl.frame || !this.system.referenceSpace) { return; }
    if (!controller.hand) {
      this.pose = frame.getPose(controller.gripSpace, this.system.referenceSpace);
      this.updatePose();
      this.updateButtons();
    }
  },

  updatePose: function () {
    var object3D = this.el.object3D;
    var pose = this.pose;
    if (!pose) { return; }
    object3D.matrix.elements = pose.transform.matrix;
    object3D.matrix.decompose(object3D.position, object3D.rotation, object3D.scale);
  },

  /**
   * Handle button changes including axes, presses, touches, values.
   */
  updateButtons: function () {
    var buttonState;
    var id;
    var controller = this.controller;
    var gamepad;
    if (!controller || !controller.gamepad) { return; }

    gamepad = controller.gamepad;
    // Check every button.
    for (id = 0; id < gamepad.buttons.length; ++id) {
      // Initialize button state.
      if (!this.buttonStates[id]) {
        this.buttonStates[id] = {pressed: false, touched: false, value: 0};
      }
      if (!this.buttonEventDetails[id]) {
        this.buttonEventDetails[id] = {id: id, state: this.buttonStates[id]};
      }

      buttonState = gamepad.buttons[id];
      this.handleButton(id, buttonState);
    }
    // Check axes.
    this.handleAxes();
  },

  /**
   * Handle presses and touches for a single button.
   *
   * @param {number} id - Index of button in Gamepad button array.
   * @param {number} buttonState - Value of button state from 0 to 1.
   * @returns {boolean} Whether button has changed in any way.
   */
  handleButton: function (id, buttonState) {
    var changed;
    changed = this.handlePress(id, buttonState) |
              this.handleTouch(id, buttonState) |
              this.handleValue(id, buttonState);
    if (!changed) { return false; }
    this.el.emit(EVENTS.BUTTONCHANGED, this.buttonEventDetails[id], false);
    return true;
  },

  /**
   * An axis is an array of values from -1 (up, left) to 1 (down, right).
   * Compare each component of the axis to the previous value to determine change.
   *
   * @returns {boolean} Whether axes changed.
   */
  handleAxes: function () {
    var changed = false;
    var controllerAxes = this.controller.gamepad.axes;
    var i;
    var previousAxis = this.axis;
    var changedAxes = this.changedAxes;

    // Check if axis changed.
    this.changedAxes.splice(0, this.changedAxes.length);
    for (i = 0; i < controllerAxes.length; ++i) {
      changedAxes.push(previousAxis[i] !== controllerAxes[i]);
      if (changedAxes[i]) { changed = true; }
    }
    if (!changed) { return false; }

    this.axis.splice(0, this.axis.length);
    for (i = 0; i < controllerAxes.length; i++) {
      this.axis.push(controllerAxes[i]);
    }
    this.el.emit(EVENTS.AXISMOVE, this.axisMoveEventDetail, false);
    return true;
  },

  /**
   * Determine whether a button press has occurred and emit events as appropriate.
   *
   * @param {string} id - ID of the button to check.
   * @param {object} buttonState - State of the button to check.
   * @returns {boolean} Whether button press state changed.
   */
  handlePress: function (id, buttonState) {
    var evtName;
    var previousButtonState = this.buttonStates[id];

    // Not changed.
    if (buttonState.pressed === previousButtonState.pressed) { return false; }

    evtName = buttonState.pressed ? EVENTS.BUTTONDOWN : EVENTS.BUTTONUP;
    this.el.emit(evtName, this.buttonEventDetails[id], false);
    previousButtonState.pressed = buttonState.pressed;
    return true;
  },

  /**
   * Determine whether a button touch has occurred and emit events as appropriate.
   *
   * @param {string} id - ID of the button to check.
   * @param {object} buttonState - State of the button to check.
   * @returns {boolean} Whether button touch state changed.
   */
  handleTouch: function (id, buttonState) {
    var evtName;
    var previousButtonState = this.buttonStates[id];

    // Not changed.
    if (buttonState.touched === previousButtonState.touched) { return false; }

    evtName = buttonState.touched ? EVENTS.TOUCHSTART : EVENTS.TOUCHEND;
    this.el.emit(evtName, this.buttonEventDetails[id], false);
    previousButtonState.touched = buttonState.touched;
    return true;
  },

  /**
   * Determine whether a button value has changed.
   *
   * @param {string} id - Id of the button to check.
   * @param {object} buttonState - State of the button to check.
   * @returns {boolean} Whether button value changed.
   */
  handleValue: function (id, buttonState) {
    var previousButtonState = this.buttonStates[id];

    // Not changed.
    if (buttonState.value === previousButtonState.value) { return false; }

    previousButtonState.value = buttonState.value;
    return true;
  }
});
