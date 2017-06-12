var fs                = require('fs');

var dictionaryHandler   = require('./dictionaryHandler'); 
var cfw                 = require('./checkfileWriter');
var parser_persons      = require('./parser_persons');
var parser_organbezuege = require('./parser_organbezuege');
var utils               = require('./utils');


Array.prototype.trimAll = function() {
    this.forEach((v,idx) => this[idx] = v.trim())
    return this
}

String.prototype.splitAtFirst = function(sep) {
    const idx = this.indexOf(sep)
    return [this.substr(0, idx), this.substr(idx+sep.length)]
}

function _parsePersonName(raw) {
    var ret = {}
    raw.trim().replace(/^((?:(?:[A-Z]{2,} )?[A-ZÖÄÜ][a-zA-Zöäü\.-]+)?\s)?(.*?)\s([A-Za-zöäü]+)$/,
        (_, title, firstName, lastName) => {
            ret = {title, firstName, lastName}
        })
    ret.full = raw
    return ret
}
 
module.exports = class CdHtmlParser {

    constructor() {
        this._parseFunctions = [
            {
                match: 'Wertpapier-Kenn-Nr.:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/\d+$/, (_) => { 
                        ret.wkn = parseInt(_) 
                    })
                    return i
                }
            },
            {
                match: 'ISIN:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/[^>]+$/, (_) => { 
                        ret.isin = _ 
                    })
                    return i
                }
            },
            {
                match: '<b>Sitz</b>',
                fn: (lines, i, ret) => {
                    try{
                    i += 1
                    var addressLines = ''
                    return; //JS: hier momentan einfach abbrechen bis Fehler behoben sind
                    do { addressLines += lines[i++] }
                    while (!(lines[i].match('<!-- weitere Sitze -->'))) //JS: Das produziert eine Index Out Of Bounds exception wenn das Tag nicht vorhanden ist 
                    const addressParts = addressLines.split('<br>').trimAll()
                    const [street_with_number, city_with_zip] = addressParts.shift().split(',').trimAll()
                    street_with_number.replace(/(.*?)\s*(\d+)$/, (_, street, street_number) => {
                        ret.street = street
                        ret.street_number = (street_number)
                    })
                    if (city_with_zip) city_with_zip.replace(/^(\d+)\s*(.*)/, (_, zip, city) => {
                        ret.zip = zip
                        ret.city = city
                    })
                    for (let addressPart of addressParts) {
                        const [k, v] = addressPart.splitAtFirst(':')
                        if (!k) continue
                        if (k.match('Telefon')) ret.phone = v
                        else if (k.match('Telefax')) ret.fax = v
                        else if (k.match(/e.mail/)) ret.email = v.split(/\s*,\s*/)
                        else if (k.match('Internetseite')) ret.www = v.split(/\s*,\s*/)
                        else console.error(`Unkwn addressPart ${k}=${v}`)
                    }
                    return i
                    }catch(ex){
                        console.log(" exception during match  ",ex);
                    }
                },
            },
            {
                match: 'Tätigkeitsgebiet/Gründung',
                disabled: false,
                fn: (lines, i, ret) => {
                    i += 1
                    var activity_description = ''
                    do { activity_description += lines[i++] }
                    while (!(lines[i].match('<b>')))
                    ret.activity_description = activity_description.replace(/<br>/g, '\n')
                    return i-1
                }
            },
            {
                match: '<br><b>Gründung',
                fn: (lines, i, ret) => {
                    lines[i].replace(/\d+/, (_) => ret.established_year = parseInt(_))
                    return i
                }
            },
            {
                match: '<b>Status:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/[^>]+$/, (_) => ret.status = _)
                    return i
                }
            },
            {
                match: '>Beschäftigte',
                disabled: false,
                fn: (lines, i, ret) => {
                    var employee_stats = []
                    const ucStyle = lines[i].match('LEFT')
                    while (!(lines[i++].match('</table>'))) {
                        if (!(lines[i].match('<td'))) continue
                        const stat = lines[i].replace(/<[^>]+>/g, '').trim()
                        if (ucStyle) {
                            if (lines[i].match('width') || lines[i].match('LEFT')) continue
                            employee_stats.push(stat)
                        } else {
                            employee_stats.push(stat)
                        }
                    }
                    ret.employee_stats = employee_stats
                    return i
                }
            },
            {
                match: 'b>Aufsichtsrat:</b><br>',
                fn: (lines, i, ret) => {
                    var originline = i; 
                    i += 1
                    var aufsichtsrat = ''
                    do { aufsichtsrat += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))
                    ret.aufsichtsrat = []
                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //console.log("Line to check is: ",_);
                        var manager = parser_persons.checkPersonLine(_,originline);
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), cfw.config.checkfile_aufsichtsrat ,cfw.config.checkfile_aufsichtsrat_enabled);                                        
                        ret.aufsichtsrat.push(manager);
                        return i-1;
                    });
                }
            },
            {
                match: 'b>Aufsichtsrat: </b><br>',
                fn: (lines, i, ret) => {
                    var commonfunct_isThere = false; 
                    var commonfunct=''; 

                    var originline = i;                 
                    var aufsichtsrat = lines[i].replace(/b>Aufsichtsrat: <\/b><br>/i,'');   //replace aufsichtsrat starter 
                    aufsichtsrat = aufsichtsrat.replace(/<br>|<|>/gi,'');                   //replace html tag rests
                    i += 1 
                    do { 
                        //Sometimes a common title with abbreviation is there, line looks like:"*) Arbeitnehmervertreter<br>"
                        if(lines[i].match(/^\*\)/)){
                            var recline = lines[i];
                            commonfunct = recline.replace('*)','').replace('<br>','').trim();
                            commonfunct_isThere = true; 
                        }
                        aufsichtsrat += lines[i++].replace('<br>', '');                        
                    }while (!(lines[i].match('<b>')))
                    ret.aufsichtsrat = []
                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //console.log("Line to check is: ",_);
                        var manager = parser_persons.checkPersonLine(_,originline,commonfunct_isThere,commonfunct);
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), cfw.config.checkfile_aufsichtsrat ,cfw.config.checkfile_aufsichtsrat_enabled);                                        
                        ret.aufsichtsrat.push(manager);
                        return i-1;
                    });
                }
            },
            {
                match: 'b>Vorstand:</b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;                 
                    i += 1
                    var vorstand = ''
                    do { vorstand += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))  
                    ret.vorstand = []
                        
                    vorstand = utils.replaceSemicolonAndCommaInBrackets(vorstand); 

                    var iend = parser_persons.parseVorstand(vorstand,originline,i,ret);
                    return iend; 
                }
            }, 
            {
                match: 'b>Vorstand: </b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;       
                    var lineBRsplit = lines[i].split('<br>');
                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    var lineBRsplice = lineBRsplit.splice(1);    
                    i += 1
                    var vorstand = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       vorstand+=lineBRsplice[x]; 
                    }       
                    ret.vorstand = []

                    var iend = parser_persons.parseVorstand(vorstand,originline,i,ret);
                    return iend;                 
                }
            },
            {
                match: 'b>Geschäftsleitung:</b><br>|b>Geschäftsleitung: </b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;       
                    var lineBRsplit = lines[i].split('<br>');
                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    var lineBRsplice = lineBRsplit.splice(1);    
                    var geschleitung = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       geschleitung+=lineBRsplice[x]; 
                    }
                    i += 1
                    if(geschleitung===''){
                        //The result must be in the next line line 
                        geschleitung=lines[i].replace('<br>','');
                    }       
                    ret.geschleitung = []
                    geschleitung = utils.replaceSemicolonAndCommaInBrackets(geschleitung);
                    geschleitung.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //console.log("Line to check is: ",_);
                        var manager = parser_persons.checkPersonLine(_,originline,false,""); //JS: HINT ADD COMMON FUNCTION IF NECESSARY 
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), cfw.config.checkfile_geschleitung ,cfw.config.checkfile_geschleitung_enabled);                                        
                        ret.geschleitung.push(manager);
                        return i-1;
                    });
                }
            },
            {
                /** 
                 * Remark: some lines are parsed directly in 'bemerkung' when there is no valid currency
                 * origin: Vorstand 1996: keine Angaben gem. § 286 Abs. 4 HGB 
                 * parsed {"jahr":"1996","bemerkung":"Vorstand 1996: keine Angaben gem. § 286 Abs. 4 HGB"}
                 */
                match: 'b>Organbezüge:</b>|b>Organbezüge :</b>|b>Organbezüge: </b>|b>OrganbezÃ¼ge:Â </b>',
                fn: (lines, i, ret) => {
                    var originline = i;      
                    var lineBRsplit = lines[i].split('</b>');                       
                    //cfw.writeHeaderToCheckFile(lineBRsplit,checkfile_organbezuege,checkfile_organbezuege_enabled);

                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    var lineBRsplice = lineBRsplit.splice(1);    
                    var organbezuege = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       organbezuege+=lineBRsplice[x].replace(/<br>/g,''); 
                       cfw.writeHeaderToCheckFile(organbezuege,cfw.config.checkfile_organbezuege,cfw.config.checkfile_organbezuege_enabled);
                    }
                    i += 1      
                    return parser_organbezuege.parseOrganbezuege(organbezuege,originline,i,ret);
                    
                }
            },
        ]
    }

    parseFile(filename) {
        console.log("Parser.js parsing file: ",filename);
        cfw.writeHeaderToCheckFile(filename+"-----------------------------",cfw.config.checkfile_aufsichtsrat,cfw.config.checkfile_aufsichtsrat_enabled);
        cfw.writeHeaderToCheckFile(filename+"-----------------------------",cfw.config.checkfile_vorstand,cfw.config.checkfile_vorstand_enabled);
        cfw.writeHeaderToCheckFile(filename+"-----------------------------",cfw.config.checkfile_geschleitung,cfw.config.checkfile_geschleitung_enabled);
        cfw.writeHeaderToCheckFile(filename+"-----------------------------",cfw.config.checkfile_organbezuege,cfw.config.checkfile_organbezuege_enabled);

        dictionaryHandler.createTitlesDict();
        dictionaryHandler.createFunctionsDict();
        return this.parse(fs.readFileSync(filename, {encoding: 'utf8'}))
    }

    parse(linesStr) {
        const lines = linesStr.split('\n');
        const ret = {}
        ret._fulltext = linesStr
            .replace(/<head>[\s\S]*<\/head>/i,'')   //replace all whitespace and n-whitespace characters between the header and the header tags 
            .replace(/<[^>]+>/g,'')                 //replace all html opening or closing tags in this script
      
        for (let i = 0; i < lines.length; i++) {
            
            for (let parseFunction of this._parseFunctions) {
                
                //if the line matches a string in the parsefunction match call the corresponding parser function 
                var lineTrim = lines[i].trim(); 

                if (lineTrim.match(parseFunction.match) && !parseFunction.disabled) {
                    i = parseFunction.fn(lines, i, ret) || i
                    break
                }
            }
        }
        return ret
    }
}