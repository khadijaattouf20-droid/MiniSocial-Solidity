// Envoie 1000 ETH de test (compte #0 de Hardhat) vers une autre adresse.
import { network } from "hardhat";
import { parseEther } from "viem";

const to = (process.env.TO ?? "0xA42665f3bFef443F1C5dcc5063DC6A7Ac5D7D8b0") as `0x${string}`;

const { viem } = await network.create();
const [account0] = await viem.getWalletClients();
const hash = await account0.sendTransaction({ to, value: parseEther("1000") });
console.log(`1000 ETH envoyés à ${to} (tx : ${hash})`);
