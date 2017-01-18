module.exports = {}
;['parser', 'validator', 'converter'].forEach(mod => {
    module.exports[mod] = require(`./lib/${mod}`)
})
