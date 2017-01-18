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
    t.equals(validator.validate(profile), true, 'is valid')
    if (validator.errors) console.log(validator.errors)
    t.comment("Let's delete the wkn")
    delete profile.wkn
    t.equals(validator.validate(profile), false, 'is not valid without wkn')
    t.comment(validator.errors)
    t.end()
})


