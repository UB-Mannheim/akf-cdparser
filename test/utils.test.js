const utils = require('../lib/utils')
const tap = require('tap')

tap.test('leafNodes', (t) => {
    t.plan(2)
    const obj = {
        foo: 32,
        xul: true,
        bar: "quux\nzuul",
        quux: [1, 2, undefined, {x:1}]
    }
    t.deepEquals(utils.leafNodes(obj),
        [ 32, true, 'quux\nzuul', 1, 2, undefined, 1 ],
        'leafNodes returned as expected')
    t.deepEquals(utils.leafNodes(obj).map(utils.cleanText), 
        [ '32', 'true', 'quux zuul', '1', '2', 'undefined', '1' ],
        'leafNodes returned as expected')
    t.end()
})
