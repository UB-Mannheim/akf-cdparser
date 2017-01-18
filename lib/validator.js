const YAML = require('js-yaml')
var Ajv = require('ajv');
const fs = require('fs')
const utils = require('./utils')

module.exports = class AkfValidator {

    constructor(options={}) {
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
        this.schema = YAML.safeLoad(fs.readFileSync(
            `${__dirname}/../schema.yml`, {encoding: 'utf8'}))
        this._validateFn = new Ajv({
            allErrors: true
        }).compile(this.schema)
    }

    unparsedText(data, replaceValues=' ', replacePredefined='*') {
        var remaining = utils.cleanText(data._fulltext)
        Object.keys(data).filter(k => !k.match(/^_fulltext/)).forEach(k => {
            utils.leafNodes(data[k]).map(utils.cleanText).forEach(str => {
                // console.log(`# For field '${k}': Strike value ${str}`)
                remaining = remaining.replace(str, replaceValues.repeat(str.length))
            })
        })
        this.predefined.forEach(str => {
            remaining = remaining.replace(new RegExp(`\\b${str}\\b`, 'g'), replacePredefined.repeat(str.length))
        })
        return remaining
    }

    validate(data) {
        return this._validateFn(data)
    }

    get errors() {
        const errs = []
        if (this._validateFn.errors) {
            this._validateFn.errors.forEach(e => errs.push(e))
        }
        if (errs.length) return errs
    }

}
