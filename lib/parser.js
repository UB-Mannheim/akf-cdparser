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
                    i += 1
                    var addressLines = ''
                    do { addressLines += lines[i++] }
                    while (!(lines[i].match('<!-- weitere Sitze -->')))
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
                        //_.replace(/([a-zäöü\s\.-]+)(?:\(([^\)]+)\))?(?:, (.*))?/i,   //(Capture nearly all signls)(except stuff in roundbrackets)(except stuff after semicolon) ignore case
                        //"Dipl.-Kfm., StB, WP      Stefan Thies (stellv. Vors.), Heinsberg, Rheinl"
                        //"                         Jürgen Günther Beck-Bazlen          , Ostfildern"
                        //"Dipl.-Kfm., StB, WP      Jürgen Beck-Bazlen          , Ostfildern"
                        //"Dipl.-Kfm., StB, WP      Jürgen Beck-Bazlen                      "
                        //"                         Ralf Thoenes (Vors.)        , Düsseldorf"
                        //" Dipl.-Kfm.       ,      Jan Kamlah (steVors.)        , Düsseldorf             
                        console.log("Line to check is: ",_);
                        var linesplit = _.split(',');           //comma seperated line 
                        var length = linesplit.length;          //length of comma seperated line  
                        var lineContainsFunct = false;          //does one item in the comma seperated line contain the 'Function' 
                        var lineFunct;                          //the string of th 'Function' itself 
                        var nameWithoutFunct; 
                        var indexFunct;                         //index of found 'Function' within the comma seperated line 

                        var nameStartIndex=-1; 
                        var currentIndex =-1; 
                        
                        var nameAndFunctInfo; 

                        //Title detection 
                        var titleInfo = dictionaryHandler.checkIfTitleIsInArray(linesplit);  

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

                        var cityAcc=""; 
                        for(var i=currentIndex;i<linesplit.length;i++){
                            //JS this is temporary to see if there are some entries > 3  
                            if(cityAcc===""){
                                cityAcc = linesplit[i].trim();
                            }else{
                                cityAcc = cityAcc +" ("+linesplit[i].trim()+")";  
                            }
                        }
                        
                        console.log("Title:   ",titleInfo.titleDetected);
                        console.log("Function:",nameAndFunctInfo.detectedFunct); 
                        console.log("Name:    ",nameAndFunctInfo.detectedName);
                        console.log("City:    ",cityAcc);

                  
                        //City detection 
                        function detectNameAndFunct(data){
                         
                            var returnobj = {
                                detectedName:"", 
                                hasName: false,
                                detectedFunct:"",
                                hasFunct: false 
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
                                return returnobj;

                            }catch(ex){
                                console.error("Problem detecting name and funct for ",data," exception ",ex);    
                            }
                        }

                            /* check for funct                         //var returnmatch = element.match(/\(*.\)/);

                            */   


                        if(lineContainsFunct){
                            //Covers all cases where the funct field is defined 
                            var title=""; 
                            for(var i=0;i<indexFunct;i++){
                                if(linesplit[i]) title+=linesplit[i]+","; 
                            } 
                        
                            var namesplit = nameWithoutFunct.split(' ');
                            var lastName = namesplit[namesplit.length-1]; //Last name is last element 
                            var firstName = nameWithoutFunct.replace(lastName,"");
                            if(title!==""){
                                 
                            }
                            
                            //const {title, firstName, lastName} = _parsePersonName(nameline); // parse the name tag 
                            var city = linesplit[indexFunct+1];
                            if(linesplit[indexFunct+2]){
                                city+=" ("+linesplit[indexFunct+2]+")"; 
                            }
                            city.trim(); 

                            const manager = {title, firstName, lastName, city, lineFunct}; 
                            for (let k in manager) if (!manager[k]) delete manager[k]
                            ret.aufsichtsrat.push(manager);
                            console.log(" manager: ",manager);                       
                        }

                        if(length==1){
                            
                            
                        }else if(length==2){


                        }else if(length==3){

                        }
                        //if(lengthkommasplit)==1 
                            //Es ist ein name 
                        //if(lengthkommasplit)==2
                            //Fall1: Titel || Name 
                            //Fall2: Name  || Stadt
                            //Wie unterscheide ich hier die Fälle? 
                            	//Titel-Eigenschaften: 
                                //Ein oder mehrere kommaelemente 
                                //Oft getrennt durch punkte 
                                //Oft Großbuchstabe letzter buchstabe 
                                //
                        //if(position can be found )
                            //Alles nach eintrag ist eine Stadt, alles davor eine positon 
                         
                    

                        //Ideen: 
                        //- Erkennung der Titel als solche mit Wörterbuch 
                        //--reduzieren des Wörterbuchs dinge die nicht mit . oder großtbuchstaben enden (ansonsten ist es titel) 
                        //--Wörterbuch bilden entweder aus alten files oder einer programmatisch erstellten liste aus den neuen files 
                        //- Commandrompt bei unklarheiten 
                        //Vornamen werden in der Datenbank mit zweit oder mittelnamen gefüllt, Nachnamen sind immer das letzte wort im namen 
                       //"Ralf Thoenes "
                       /*
                        (_, name, funct, city) => {
                            const {title, firstName, lastName} = _parsePersonName(name)
                            const manager = {title, firstName, lastName, city, funct}
                            for (let k in manager) if (!manager[k]) delete manager[k]
                            ret.aufsichtsrat.push(manager)
                        })
                        */
                        
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
