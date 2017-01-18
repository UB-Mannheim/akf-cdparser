const YAML = require('js-yaml')
var Ajv = require('ajv');
const fs = require('fs')

module.exports = class AkfValidator {

    constructor() {
        this.schema = YAML.safeLoad(fs.readFileSync(
            `${__dirname}/../schema.yml`, {encoding: 'utf8'}))
        var ajv = new Ajv();
        this.validate = ajv.compile(this.schema);
    }

    get errors() {
        return this.validate.errors
    }

}
