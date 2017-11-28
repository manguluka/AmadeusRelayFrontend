import { Order } from "../model/order";
import { TokenInfo } from "../model/tokenInfo";
import Vue from 'vue'
import axios from 'axios';
import { BigNumber } from 'bignumber.js';
import { ZeroEx, TransactionReceiptWithDecodedLogs, SignedOrder, Token } from '0x.js';
declare var web3;

export class OrderService {
    private zeroEx: ZeroEx;

    public constructor() {
        this.zeroEx = new ZeroEx(web3.currentProvider);
    }

    public async listOrders(tokenA?: string, tokenB?: string): Promise<Order[]> {
        var tokenAAddress = await this.getTokenAddress(tokenA);
        var tokenBAddress = await this.getTokenAddress(tokenB);
        
//        return this.getDataFromApi('http://' + process.env.AMADEUS_SERVER_HOSTNAME + ':' + process.env.AMADEUS_SERVER_PORT + '/api/v0/orders?makerTokenAddress=' + tokenA + "&takerTokenAddress=" + tokenBAddress.address, {}).then((response) => this.successGetOrder(response)); 
        return this.getDataFromApi('http://' + 'api.amadeusrelay.org' + '/api/v0/orders?makerTokenAddress=' + tokenAAddress + "&takerTokenAddress=" + tokenBAddress, {}).then((response) => this.successGetOrder(response));
    }

    public async checkMetamaskNetWork(): Promise<string> {
        let message = null
        if (typeof web3 == 'undefined') {
            message = 'No web3? You should consider trying MetaMask!'
        }
        else {
            let network = web3.version.network
            if(network != "42"){
                if(network == "1"){
                    message = "You are connected to the mainnet, switch do the Kovan network to try this demo!"
                }
                else if(network == "3"){
                    message = "You are connected to ropsten test network, switch do the Kovan network to try this demo!"
                }
                else {
                    message = "Please connect to the Kovan network to try this demo!"
                }
            }
        }
        return message
    }

    public async fillOrder(order: Order, takerAmount: BigNumber) {
        var takerAddress: string = web3.eth.coinbase
        //var amount = ZeroEx.toBaseUnitAmount(takerAmount, 18)
        
        this.wrapETH(takerAmount, takerAddress)

        await this.zeroEx.token.setUnlimitedProxyAllowanceAsync(order.takerTokenAddress, takerAddress)

        const txHash : string = await this.zeroEx.exchange.fillOrderAsync(this.convertToSignedOrder(order), takerAmount, true, takerAddress);
        return this.zeroEx.awaitTransactionMinedAsync(txHash);
    }

    public async getTokenPairs(tokenA : string) : Promise<string[]> {
        if (tokenA === "ETH") tokenA = "WETH";

        return this.getDataFromApi('http://' + 'api.amadeusrelay.org' + '/api/v0/token_pairs?tokenA=' + tokenA, {}).then((response) => this.successGetTokenPair(response, tokenA));
    }

    public async getTokenSymbol(tokenAddress: string) :  Promise<string> {
        let tokenReceived = (await this.zeroEx.tokenRegistry.getTokenIfExistsAsync(tokenAddress))
        if (tokenReceived == null) return null;
        if (tokenReceived.symbol === 'WETH') return 'ETH'
        return tokenReceived.symbol;
    }

    private async wrapETH(amount: BigNumber, address: string): Promise<void> {
        let tokenReceived = (await this.zeroEx.tokenRegistry.getTokenIfExistsAsync(address))

        if (!tokenReceived || tokenReceived.symbol != "ETH") return

        const balance = await this.zeroEx.token.getBalanceAsync(await this.zeroEx.etherToken.getContractAddressAsync(), address);
        if (balance.lessThan(amount)) {
            const tx = await this.zeroEx.etherToken.depositAsync(amount.minus(balance), address);
            await this.zeroEx.awaitTransactionMinedAsync(tx);
        }
    }

    private successGetOrder(response) : any{
        return this.convertOrders(response);
    }

    private successGetTokenPair(response: any, tokenA: string) : any {
        return this.convertTokenPairs(response, tokenA);
    }  

    private convertOrders(response: any) :  Order[]
    {
        let orders: Order[] = new Array();
        response.data.forEach((responseOrder) => {
            orders.push({
                maker: responseOrder.maker,
                taker: responseOrder.taker,
                makerFee: responseOrder.makerFee,
                takerFee: responseOrder.takerFee,
                makerTokenAmount: responseOrder.makerTokenAmount,
                takerTokenAmount: responseOrder.takerTokenAmount,
                makerTokenAddress: responseOrder.makerTokenAddress,
                takerTokenAddress: responseOrder.takerTokenAddress,
                ecSignature: responseOrder.ecSignature,
                exchangeContractAddress: responseOrder.exchangeContractAddress,
                expirationUnixTimestampSec: responseOrder.expirationUnixTimestampSec,
                feeRecipient: responseOrder.feeRecipient,
                salt: responseOrder.salt,
                valueRequired: ''
            });
        });
        return orders;
    }

    private async convertTokenPairs(response: any, tokenA: string) :  Promise<string[]> {
        let tokens: string[] = new Array();
        for (let responseToken of response.data) {
            if (!response.data) continue

            let tokenAddress = responseToken.tokenA.address;
            if (tokenA) {
                tokenAddress = responseToken.tokenB.address;
            }  

            let symbol = await this.getTokenSymbol(tokenAddress);
            if(symbol != null && tokens.indexOf(symbol) <= -1){
                tokens.push(symbol);
            }
        }
        return tokens;
    }

    private convertToSignedOrder(order: Order) :  SignedOrder
    {
        var signedOrder : SignedOrder = {
                maker: order.maker,
                taker: order.taker,
                makerFee: new BigNumber(order.makerFee),
                takerFee: new BigNumber(order.takerFee),
                makerTokenAmount: new BigNumber(order.makerTokenAmount),
                takerTokenAmount: new BigNumber(order.takerTokenAmount),
                makerTokenAddress: order.makerTokenAddress,
                takerTokenAddress: order.takerTokenAddress,
                ecSignature: order.ecSignature,
                salt: new BigNumber(order.salt),
                exchangeContractAddress: order.exchangeContractAddress,
                expirationUnixTimestampSec: new BigNumber(order.expirationUnixTimestampSec),
                feeRecipient: order.feeRecipient
            };
        return signedOrder;
    }

    private async getTokenAddress(symbol: string) : Promise<string> {
        if (symbol === "ETH") return await this.zeroEx.etherToken.getContractAddressAsync();

        var token : Token = await this.getToken(symbol);

        if (token) { return token.address; }

        return "";
    }

    private async getToken(symbol: string) : Promise<Token> {
        return await this.zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync(symbol);
    }

    private getDataFromApi (path: string, params: any) :  Promise<any> {
        return axios.get(path, {
            params: params
        })
    }
}