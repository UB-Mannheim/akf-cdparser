const fs = require('fs')
var dictionaryHandler = require('./dictionaryHandler'); 


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

/**
 * Detect First Name and Lastname from given name and also the function which is in '()'  
 * @param {string} data: An example input string looks like this: Jane Vaine (Vors.) 
 * Currently used for:
 * Aufsichtsrat 
 * 
 * @returns {object} which contains the detected name and function and indicators if these properties could be found 
 **/ 
function detectNameAndFunct(data){
    
    var returnobj = {
        detectedName:"", 
        hasName: false,
        detectedFunct:"",
        hasFunct: false,
        firstname:"",
        lastname:""
    }
    try{     
        var returnmatch = data.match(/\((.*?)\)/);
        
        if(returnmatch!=null){
            returnobj.hasFunct = true; 
            returnobj.detectedFunct = returnmatch[1];
            returnobj.hasName = true; 
            returnobj.detectedName =  data.replace(returnmatch[0],"").trim(); 
        }else{
            returnobj.hasName = true; 
            returnobj.detectedName = data;
        }
        
        //Split name in first and lastname 
        var namesplit = returnobj.detectedName.split(' ');
        var lastname = namesplit[namesplit.length-1]; //Just take the last element
        var firstname = returnobj.detectedName.replace(lastname,""); 
        returnobj.lastname = lastname; 
        returnobj.firstname = firstname; 

        return returnobj;

    }catch(ex){
        console.error("Problem detecting name and funct for ",data," exception ",ex);    
    }
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
                        else console.error(`Unknown addressPart ${k}=${v}`)
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
                    i += 1
                    var aufsichtsrat = ''
                    do { aufsichtsrat += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))
                    ret.aufsichtsrat = []
                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                  
                        console.log("Line to check is: ",_);
                        
                        var linesplit = _.split(',');           //comma seperated line 
                        var nameStartIndex=-1; 
                        var currentIndex =-1;                       
                        var nameAndFunctInfo;                   //object for storing detected name and funct 
                        var titleInfo;                          //object for storing detected title

                        //Title detection 
                        var matchingOption ="normal";           //'normal' or 'ldist' is possible 
                        titleInfo = dictionaryHandler.checkIfTitleIsInArray(linesplit,',',matchingOption);  
                        
                        //Name and Funct detection 
                        if(!titleInfo.hasName && !titleInfo.hasTitle){
                            currentIndex=0; //Proceed with the first element for name detection 
                            nameAndFunctInfo = detectNameAndFunct(linesplit[currentIndex]); 
                            currentIndex = currentIndex+1; 
                        }
                        else if(titleInfo.hasName){
                            nameAndFunctInfo = detectNameAndFunct(titleInfo.nameDetected);
                            currentIndex = titleInfo.nextIndex;
                        }else {
                            nameAndFunctInfo = detectNameAndFunct(linesplit[titleInfo.nextIndex]);
                            currentIndex = titleInfo.nextIndex; 
                        }


                        //City detection 
                        var cityAcc=""; 
                        for(var i=currentIndex;i<linesplit.length;i++){
                            //JS this is temporary to see if there are more entries then 3 for the city
                            if(cityAcc===""){
                                cityAcc = linesplit[i].trim();
                            }else{
                                cityAcc = cityAcc +" ("+linesplit[i].trim()+")";  
                            }
                        }
                        /*
                        console.log("Title:   ",titleInfo.titleDetected);
                        console.log("Function:",nameAndFunctInfo.detectedFunct); 
                        console.log("Firstname:    ",nameAndFunctInfo.firstname);
                        console.log("Lastname:    ",nameAndFunctInfo.lastname);                      
                        console.log("City:    ",cityAcc);
                        */
                        var title = titleInfo.titleDetected; 
                        var firstName = nameAndFunctInfo.firstname; 
                        var lastName = nameAndFunctInfo.lastname; 
                        var funct = nameAndFunctInfo.detectedFunct; 

                        const manager = {title, firstName, lastName, cityAcc, funct}; 
                        for (let k in manager) if (!manager[k]) delete manager[k]
                        ret.aufsichtsrat.push(manager);
                        console.log(" manager: ",manager);                                               
                    })
                    return (i-1)
                }
            },
            {
                match: 'b>Vorstand:</b><br>',
                fn: (lines, i, ret) => {
                    i += 1
                    var vorstand = ''
                    do { vorstand += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))  
                    ret.vorstand = []
                    vorstand.split(/\s*;\s*/).trimAll().forEach(_ => {              //Split all entries between semicolon and trim
                        _.replace(/([a-zäöü\s\.-]+)(?:\(([^\)]+)\))?(?:, (.*))?/i,  //Capture the most characters statements in first froupt don't match stuff in 
                        (_, name, funct, city) => {
                            const {title, firstName, lastName} = _parsePersonName(name)
                            const manager = {title, firstName, lastName, city, funct}
                            for (let k in manager) if (!manager[k]) delete manager[k]
                            ret.vorstand.push(manager)
                        })
                    })
                    return (i-1)
                }
            },
        ]
    }

    parseFile(filename) {
        dictionaryHandler.createTitlesDict();
        return this.parse(fs.readFileSync(filename, {encoding: 'utf8'}))
    }

    parse(linesStr) {
        const lines = linesStr.split('\n')
        const ret = {}
        ret._fulltext = linesStr
            .replace(/<head>[\s\S]*<\/head>/i,'')   //replace all whitespace and non-whitespace characters between the header and the header tags 
            .replace(/<[^>]+>/g,'')                 //replace all html opening or closing tags in this script
      
        for (let i = 0; i < lines.length; i++) {
            
            for (let parseFunction of this._parseFunctions) {
                //if the line matches a string in the parsefunction match call the corresponding parser function 
                if (lines[i].match(parseFunction.match) && !parseFunction.disabled) {
                    i = parseFunction.fn(lines, i, ret) || i
                    break
                }
            }
        }
        return ret
    }

}
