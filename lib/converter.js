function _escapeQuote(str) {
    return str.replace("'", "\\'")
}

function _makeInsert(table, values) {
    return `INSERT INTO "${table}" VALUES(${
        values
            .map(v => (v === undefined) 
                ? 'NULL' 
                : typeof v === 'string' 
                    ? "'"+_escapeQuote(v)+"'"
                    : v
                ).join(', ')
    });\n`;

}

module.exports = class AkfConverter {

    json2sql(profil) {
        var ret = ''
        profil.aufsichtsrat.forEach(manager => {
            ret += _makeInsert('Aufsichtsrat', [
                profil.wkn,
                manager.lastName,
                manager.firstName,
                manager.title,
                manager.city,
                manager.rank,
                '---',
                0,
            ])
        })
        return ret
    }

}
