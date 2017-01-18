function cleanText(literal) {
    return (''+literal).toLowerCase().replace(/[\s\n\t,;\(\):\.-]+/g, ' ')
    // return (''+literal).replace(/[\s\n\t]/g, '')
}

function leafNodes(obj, ret=[]) {
    if (Array.isArray(obj)) {
        obj.forEach(el => leafNodes(el, ret))
    } else if (typeof obj === 'object') {
        Object.keys(obj).forEach(k => leafNodes(obj[k], ret))
    } else {
        ret.push(obj)
    }
    return ret
}

module.exports = {
    cleanText,
    leafNodes,
}
