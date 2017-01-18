const parser = new(require('../lib/parser'))()
const validator = new(require('../lib/validator'))()
const fs = require('fs')
const tap = require('tap');

function readFixture(fixtureName) {
    return fs.readFileSync(`${__dirname}/fixtures/${fixtureName}`, {encoding:'utf8'})
}

tap.test('parse + validate', (t) => {
    const profile = parser.parse(readFixture('html/2005/0003.html.utf8.html'))
    t.comment(profile)
    t.equals(profile.city, 'Plochingen', 'city == Plochingen')
    t.equals(profile.email.length, 2, '2 email addresses')
    const valid = validator.validate(profile)
    t.equals(valid, true, 'is valid')
    if (!valid) t.comment(validator.errors)
    t.comment(validator.unparsedText(profile, '\x1b[42m \x1b[0m', '\x1b[43m \x1b[0m'))
    t.comment("Let's delete the wkn")
    delete profile.wkn
    t.equals(validator.validate(profile), false, 'is not valid without wkn')
    t.comment(validator.errors)
    t.end()
})


