var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var bitcore = require("bitcore-lib");

app.use(bodyParser.urlencoded({}));

app.get("/", function(req, res){
	res.sendfile(__dirname + "/index2.html");
});

app.post("/address", function(req,res){
	var wif = req.body.pkey;
	var output = req.body.addy;
	var address = new bitcore.PrivateKey(wif).toAddress();
	console.log(address);
	
	//create a tx
	var privateKey = new bitcore.PrivateKey(wif);
	
	//get unspent from bcinfo
	var request = require("request");
	var url = "https://blockchain.info/unspent?active="+ address;
	request({
		url: url,
		json: true
	},function(error, response, body){
		var num = body.unspent_outputs.length;
		var utxos = [];
		var totalSats = 0;	
		var txSize = 44;
			
			for(i=0;i < num; i++){
			var utxo = {
				"txId": body.unspent_outputs[i].tx_hash_big_endian,
				"outputIndex": body.unspent_outputs[i].tx_output_n,
				"address": address,
				"script": body.unspent_outputs[i].script,
				"satoshis": body.unspent_outputs[i].value
			};
			utxos.push(utxo);
			totalSats = totalSats + body.unspent_outputs[i].value;
			txSize = txSize + 180;
			};
			
		var fee = txSize * 20;
		totalSats = totalSats - fee;
		
		if(totalSats < 1){
		 alert("you don't have enough funds to send with a sufficient fee");
		} else {
			
		var transaction = new bitcore.Transaction()
		  .from(utxos)
		  .to(output, totalSats)
		  .sign(wif);
		
				
		console.log(transaction);
		console.log("done");
		};
		//display to user
		res.send("Fee: " + fee + 
		"<br>Amount sent: " + totalSats + "<br>Destination: " + output + "<br><br>TX Hash " + transaction);
	});
	
	});

app.listen(8080, function(){
	console.log("sever running on 8080");
});