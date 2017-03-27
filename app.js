//require express, bitcore, request and body parser
var express = require("express");
var app = express();
var request = require("request");
var bodyparser = require("body-parser");
var bitcore = require("bitcore-lib");

//set ejs as view engine template
app.set("view engine", "ejs");

//tell express to use bodyparser
app.use(bodyparser.urlencoded({
    extended: true
}));
app.use(bodyparser.json());

//render index page under root dir
app.get("/", function(req, res){
    res.render("pages/index.ejs", {
         outMessage: ""
    });
});

//render address page on POST data
app.post("/address", function(req,res){
	var pkey = req.body.pkey;
	var addr = req.body.addy;
	
    validateAddress(addr, function(isAddyValid){
        if(isAddyValid == 0){
          res.render("pages/index.ejs", {
            outMessage: "Destination address invalid"
          });  
        } else {
            validatePrivateKey(pkey, function(isPkValid){
                if(isPkValid == 0){
                    res.render("pages/index.ejs", {
                    outMessage: "Private Key invalid"
                    });
                } else {
                    convertPK(pkey, function(convertedAddy){
                        getUTXO(convertedAddy, function(result, feeAmt, totalToSend){
                            if(result == 1){
                                res.render("pages/index.ejs", {
                                    outMessage: "No UTXO"
                                });     
                            } else if(result == 2){
                                res.render("pages/index.ejs", {
                                    outMessage: "Source offline"
                                });
                            } else if(result == 3){
                                res.render("pages/index.ejs", {
                                    outMessage: "Insufficient funds to pay fee"
                                });
                            } else {
                                buildTX(result, feeAmt, totalToSend, pkey, addr, function(payloadTx){
                                    pushTX(payloadTx, function(txdone){
                                        if(txdone !== 1){
                                            res.render("pages/index.ejs", {
                                            outMessage: "TX ID: " + txdone
                                            });
                                        } else {
                                            res.render("pages/index.ejs", {
                                            outMessage: "broadcast failed try later"
                                            });
                                        }
                                    });
                                });
                            }
                        });
                    });
                }
            });//end validatePrivateKey
        }
    });//end validate address
}); //end app post

app.listen(80, function(){
	console.log("sever running on 80");
});

//functions
//validate address
function validateAddress(output, result){
    addyValue = output.replace(/[^\w\s]/gi, '');
    if(bitcore.Address.isValid(addyValue)){
    result(1);
    } else {
    result(0);    
    };
};

//convert pk to addr
function convertPK(pkeyValue, result){
    var address = new bitcore.PrivateKey(pkeyValue).toAddress();
    result(address);
};

function validatePrivateKey(wif, result){
pkeyValue = wif.replace(/[^\w\s]/gi, '');
		if(bitcore.PrivateKey.isValid(pkeyValue)){
		//private key is valid
        result(1);
        } else {
        result(0);    
        };
};

//get outputs
function getUTXO(address, callback){
    request({
        url: "https://chain.so/api/v2/get_tx_unspent/btc/"+address,
        json: true
    }, function(error, response, body){
        if(!error && response.statusCode == 200){
            if(body.data.txs.length < 1){
                //no utxos
                console.log("no utxo");
                var err = 1;
                callback(err);
            }
            var status = body.status;
            var num = body.data.txs.length;
            var utxos = [];
            var totalSats = 0;	
            var txSize = 44;
                //loop through all UTXOs
                for(i=0;i < num; i++){
		    var convertSats = body.data.txs[i].value * 100000000;
		    convertSats = parseInt(convertSats);
                
                    var utxo = {
                    "txId": body.data.txs[i].txid,
                    "outputIndex": body.data.txs[i].output_no,
                    "address": address,
                    "script": body.data.txs[i].script_hex,
                    "satoshis": convertSats
                    };
			utxos.push(utxo);
			totalSats = totalSats + convertSats;
			//calc tx size for fee
			txSize = txSize + 180;
                }; //end utxo loop
            var fee = txSize * 20;
            totalSats = totalSats - fee;
            console.log(totalSats);
            console.log(fee);
                if(totalSats < 1){
                    //not enough funds to send
                    var err = 3;
                    callback(err);
                } else {
                    callback(utxos, fee, totalSats);  
                }
            
       } else {
           //err or no response from api
           console.log("no response from api");
            var error = 2;
           callback(error);
       }
    });
};

//build transaction
function buildTX(utxo, fee, total, pkeyValue, output, callback){

        var transaction = new bitcore.Transaction()
        .from(utxo)
        .to(output, total)
        .sign(pkeyValue);

        //payload to push tx
        var txjson = transaction.toString();
        var pload = {
            "tx": txjson
        };
        callback(pload);  
};


//push transaction
function pushTX(pload, callback){
    request({
	url: "https://api.blockcypher.com/v1/btc/main/txs/push",
	method: "POST",
	json: true,
	headers: {"content-type": "application/json"},
	body: pload
	}, function(err, response, body){
           	if(err){ 
		 //no response or error POST to chainso
	         callback(1);    
		} else {
                console.log(JSON.stringify(body));
                completeTxId = body.tx.hash;
                console.log("done");
                callback(completeTxId);
           	};                
    });
};
