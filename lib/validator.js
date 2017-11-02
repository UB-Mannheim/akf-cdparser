/**
 * Validator.js 
 * 
 * Validates a given data against a scheme defined in yml 
 * WARNING: this is depreceatated.  The 'HTMLvsJSON' tool is used for full 
 * validation. 
 */

 
const YAML = require('js-yaml');
var Ajv = require('ajv');
const fs = require('fs');
const utils = require('./utils');

module.exports = class AkfValidator {
    /**
     * Construct a validator object 
     * @param {object} options  - validation options (default value is empty object)
     */
    constructor(options={}) {
        //Predefined contains static tags which are subtracted all the time 
        this.predefined = (options.predefined || [
            'Status',
            'Tätigkeitsgebiet/Gründung',
            'Gründung',
            'e-mail',
            'Telefon',
            'Management',
            'Aufsichtsrat',
            'Stammaktien',
            'Nennwert',
            'Internetseite',
            'Telefax',
            'ISIN',
            'Wertpapier-Kenn.Nr'
        ]).map(utils.cleanText)
        //Load validation scheme
        this.schema = YAML.safeLoad(fs.readFileSync(
            `${__dirname}/../schema.yml`, {encoding: 'utf8'}))
        this._validateFn = new Ajv({
            allErrors: true
        }).compile(this.schema)  
    }

	
    unparsedText(data, replaceValues=' ', replacePredefined='*') {
        var remaining = utils.cleanText(data._fulltext);
        Object.keys(data).filter(k => !k.match(/^_fulltext/)).forEach(k => {
            utils.leafNodes(data[k]).map(utils.cleanText).forEach(str => {
                // console.log(`# For field '${k}': Strike value ${str}`)
                remaining = remaining.replace(new RegExp(`\\s*${str}\\s*`), replaceValues.repeat(str.length));
            })
        })
        this.predefined.forEach(str => {
            remaining = remaining.replace(new RegExp(`\\s*\\b${str}\\b\\s*`, 'g'), replacePredefined.repeat(str.length))
        })
        return remaining
    }
	
	/*
	 * This validates a given data block against the scheme defined in .yml 
	 **/
    validate(data) {
        return this._validateFn(data);
    }

    get errors() {
        const errs = [];
        if (this._validateFn.errors) {
            this._validateFn.errors.forEach(e => errs.push(e));
        }
        if (errs.length) return errs;
    }

}
