import objectHash from 'object-hash';
import { hotkeys as mouseTrapAPI } from '../utils';
import isequal from 'lodash.isequal';
import Hotkey from './Hotkey';

/**
 *
 *
 * @typedef {Object} HotkeyDefinition
 * @property {String} commandName - Command to call
 * @property {Object} commandOptions - Command options
 * @property {String} label - Display name for hotkey
 * @property {String[]} keys - Keys to bind; Follows Mousetrap.js binding syntax
 */

export class HotkeysManager {
  private _servicesManager: AppTypes.ServicesManager;
  private _commandsManager: AppTypes.CommandsManager;
  private isEnabled: boolean = true;
  public hotkeyDefinitions: Record<string, any>;
  public hotkeyDefaults: any[];

  constructor(
    commandsManager: AppTypes.CommandsManager,
    servicesManager: AppTypes.ServicesManager
  ) {
    this.hotkeyDefinitions = {};
    this.hotkeyDefaults = [];

    this._servicesManager = servicesManager;
    this._commandsManager = commandsManager;
  }

  /**
   * Exposes Mousetrap.js's `.record` method, added by the record plugin.
   *
   * @param {*} event
   */
  record(event) {
    return mouseTrapAPI.record(event);
  }

  cancel() {
    mouseTrapAPI.stopRecord();
    mouseTrapAPI.unpause();
  }

  /**
   * Disables all hotkeys. Hotkeys added while disabled will not listen for
   * input.
   */
  disable() {
    this.isEnabled = false;
    mouseTrapAPI.pause();
  }

  /**
   * Enables all hotkeys.
   */
  enable() {
    this.isEnabled = true;
    mouseTrapAPI.unpause();
  }

  /**
   * Uses most recent
   *
   * @returns {undefined}
   */
  restoreDefaultBindings() {
    this.setHotkeys(this.hotkeyDefaults);
  }

  /**
   *
   */
  destroy() {
    this.hotkeyDefaults = [];
    this.hotkeyDefinitions = {};
    mouseTrapAPI.reset();
  }

  /**
   * Registers a list of hotkey definitions.
   *
   * @param {HotkeyDefinition[] | Object} [hotkeyDefinitions=[]] Contains hotkeys definitions
   */
  setHotkeys(hotkeyDefinitions = [], name = 'hotkey-definitions') {
    try {
      const definitions = this.getValidDefinitions(hotkeyDefinitions);
      if (isequal(definitions, this.hotkeyDefaults)) {
        console.debug('equal');
        localStorage.removeItem(name);
      } else {
        localStorage.setItem(name, JSON.stringify(definitions));
      }
      definitions.forEach(definition => this.registerHotkeys(definition));
    } catch (error) {
      const { uiNotificationService } = this._servicesManager.services;
      uiNotificationService.show({
        title: 'Hotkeys Manager',
        message: 'Error while setting hotkeys',
        type: 'error',
      });
    }
  }

  /**
   * Set default hotkey bindings. These
   * values are used in `this.restoreDefaultBindings`.
   *
   * @param {HotkeyDefinition[] | Object} [hotkeyDefinitions=[]] Contains hotkeys definitions
   */
  setDefaultHotKeys(hotkeyDefinitions = []) {
    const definitions = this.getValidDefinitions(hotkeyDefinitions);
    this.hotkeyDefaults = definitions;
  }

  /**
   * Take hotkey definitions that can be an array or object and make sure that it
   * returns an array of hotkeys
   *
   * @param {HotkeyDefinition[] | Object} [hotkeyDefinitions=[]] Contains hotkeys definitions
   */
  getValidDefinitions(hotkeyDefinitions) {
    const definitions = Array.isArray(hotkeyDefinitions)
      ? [...hotkeyDefinitions]
      : this._parseToArrayLike(hotkeyDefinitions);

    return definitions;
  }

  /**
   * Take hotkey definitions that can be an array and make sure that it
   * returns an object of hotkeys definitions
   *
   * @param {HotkeyDefinition[]} [hotkeyDefinitions=[]] Contains hotkeys definitions
   * @returns {Object}
   */
  getValidHotkeyDefinitions(hotkeyDefinitions) {
    const definitions = this.getValidDefinitions(hotkeyDefinitions);
    const objectDefinitions = {};
    definitions.forEach(definition => {
      const { commandName, commandOptions } = definition;
      const commandHash = objectHash({ commandName, commandOptions });
      objectDefinitions[commandHash] = definition;
    });
    return objectDefinitions;
  }

  /**
   * It parses given object containing hotkeyDefinition to array like.
   * Each property of given object will be mapped to an object of an array. And its property name will be the value of a property named as commandName
   *
   * @param {HotkeyDefinition[] | Object} [hotkeyDefinitions={}] Contains hotkeys definitions
   * @returns {HotkeyDefinition[]}
   */
  _parseToArrayLike(hotkeyDefinitionsObj = {}) {
    const copy = { ...hotkeyDefinitionsObj };
    return Object.entries(copy).map(entryValue =>
      this._parseToHotKeyObj(entryValue[0], entryValue[1])
    );
  }

  /**
   * Return HotkeyDefinition object like based on given property name and property value
   * @param {string} propertyName property name of hotkey definition object
   * @param {object} propertyValue property value of hotkey definition object
   */
  _parseToHotKeyObj(propertyName, propertyValue) {
    return {
      commandName: propertyName,
      ...propertyValue,
    };
  }

  /**
   * (unbinds and) binds the specified command to one or more key combinations.
   * When a hotkey combination is triggered, the command name and active contexts
   * are used to locate the correct command to call.
   *
   * @param {HotkeyDefinition} command
   * @param {String} extension
   * @returns {undefined}
   */
  registerHotkeys({ commandName, commandOptions = {}, context, keys, label, isEditable }: Hotkey) {
    if (!commandName) {
      throw new Error(`No command was defined for hotkey "${keys}"`);
    }

    const commandHash = objectHash({ commandName, commandOptions });
    const previouslyRegisteredDefinition = this.hotkeyDefinitions[commandHash];

    if (previouslyRegisteredDefinition) {
      const previouslyRegisteredKeys = previouslyRegisteredDefinition.keys;
      this._unbindHotkeys(commandName, previouslyRegisteredKeys);
    }

    // Set definition & bind
    this.hotkeyDefinitions[commandHash] = {
      commandName,
      commandOptions,
      keys,
      label,
      isEditable,
    };
    this._bindHotkeys(commandName, commandOptions, context, keys);
  }

  /**
   * Binds one or more set of hotkey combinations for a given command
   *
   * @private
   * @param {string} commandName - The name of the command to trigger when hotkeys are used
   * @param {string[]} keys - One or more key combinations that should trigger command
   * @returns {undefined}
   */
  _bindHotkeys(commandName, commandOptions = {}, context, keys) {
    const isKeyDefined = keys === '' || keys === undefined;
    if (isKeyDefined) {
      return;
    }

    const isKeyArray = keys instanceof Array;
    const combinedKeys = isKeyArray ? keys.join('+') : keys;

    mouseTrapAPI.bind(combinedKeys, evt => {
      evt.preventDefault();
      evt.stopPropagation();
      this._commandsManager.runCommand(commandName, { evt, ...commandOptions }, context);
    });
  }

  /**
   * unbinds one or more set of hotkey combinations for a given command
   *
   * @private
   * @param {string} commandName - The name of the previously bound command
   * @param {string[]} keys - One or more sets of previously bound keys
   * @returns {undefined}
   */
  _unbindHotkeys(commandName, keys) {
    const isKeyDefined = keys !== '' && keys !== undefined;
    if (!isKeyDefined) {
      return;
    }

    const isKeyArray = keys instanceof Array;
    if (isKeyArray) {
      const combinedKeys = keys.join('+');
      this._unbindHotkeys(commandName, combinedKeys);
      return;
    }

    mouseTrapAPI.unbind(keys);
  }
}

export default HotkeysManager;
