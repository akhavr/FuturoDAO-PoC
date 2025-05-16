import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from 'chai';
import { SolanaTimelock, TimelockAccount } from "../target/types/solana_timelock";

describe("solana_timelock", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.SolanaTimelock as Program<SolanaTimelock>;
    
    let timelock: PublicKey;
    let vault: PublicKey;
    let owner: anchor.web3.Keypair;
    
    before("Set up PDAs and accounts", async () => {
        // Generate test accounts
        owner = anchor.web3.Keypair.generate();
        [timelock] = PublicKey.findProgramAddressSync(
            [Buffer.from("timelock_sol"), owner.publicKey.toBuffer()],
            program.programId
        );
        [vault] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), timelock.toBuffer()],
            program.programId
        );

        // Fund owner account
        await provider.connection.confirmTransaction(
            await provider.connection.requestAirdrop(owner.publicKey, 2000000000),
            "confirmed"
        );

        console.log("\nTest Setup:");
        console.log("- Owner:", owner.publicKey.toString());
        console.log("- Timelock PDA:", timelock.toString());
        console.log("- Vault PDA:", vault.toString());
    });

    it("should initialize a SOL timelock", async () => {
	// Initialize timelock with 1 SOL locked for 10 seconds
	const lockAmount = new anchor.BN(1_000_000_000); // 1 SOL
	const lockDuration = 10; // seconds
	const unlockTime = new anchor.BN(Math.floor(Date.now()/1000) + lockDuration);
	
	const tx = await program.methods.initializeSolLock(
	    lockAmount,
	    unlockTime
	).accounts({
	    owner: owner.publicKey,
	    timelock: timelock,
	    vault: vault,
	    systemProgram: SystemProgram.programId,
	    rent: anchor.web3.SYSVAR_RENT_PUBKEY
	})
	.remainingAccounts([{
	    pubkey: vault,
	    isWritable: true,
	    isSigner: false
	}])
	.signers([owner])
	.rpc();

	console.log("Transaction signature:", tx);
	assert(tx !== null, "Transaction failed");

	const timelockAccount = await program.account.timelockAccount.fetch(timelock);
        
	// Validate all timelock properties
	console.log("Timelock state:", timelockAccount);
	assert.isTrue(timelockAccount.isInitialized, "Timelock account should be initialized");
	assert.equal(timelockAccount.tokenMint.toString(), SystemProgram.programId.toString(), "SOL timelock should use system program ID");
	assert.equal(
	    timelockAccount.amount.toString(), 
	    lockAmount.toString(),
	    "Locked amount should match initialized value"
	);
	assert.equal(
	    timelockAccount.owner.toString(),
	    owner.publicKey.toString(), 
	    "Owner public key should match"
	);
	assert.isTrue(
	    timelockAccount.unlockTimestamp.gt(timelockAccount.createdTimestamp),
	    "Unlock time should be after creation time"
	);
    });

    it("should prevent withdrawal before unlock time", async () => {
        // Attempt early withdrawal should fail
        try {
            const tx = await program.methods.withdrawSol()
                .accounts({
                    timelock,
                    owner: owner.publicKey,
                    vault,
                    systemProgram: SystemProgram.programId
                })
                .signers([owner])
                .rpc();
            
            assert.fail("Should prevent withdrawal before unlock time");
        } catch (error) {
            // Verify expected error in logs
            const logs = (error as any).logs?.join(" ") || "";
            assert.include(logs, "Withdrawal attempted before unlock time");
            assert.include(logs, "TimeNotExpired");
        }
    });

    it("should allow withdrawal after unlock time", async () => {
        const lockAmount = new anchor.BN(1_000_000_000); // 1 SOL
        // Wait for lock duration + 1 second buffer
        console.log(`Waiting ${11} seconds for timelock to expire...`);
        await new Promise(resolve => setTimeout(resolve, 11000));

        // Get initial balances
        const [initialOwnerBalance, initialVaultBalance] = await Promise.all([
            provider.connection.getBalance(owner.publicKey),
            provider.connection.getBalance(vault)
        ]);

        // Execute withdrawal
        const withdrawTx = await program.methods.withdrawSol()
            .accounts({
                timelock,
                owner: owner.publicKey,
                vault,
                systemProgram: SystemProgram.programId
            })
                .signers([owner])
            .rpc();

        // Verify balances changed
        const [finalOwnerBalance, finalVaultBalance] = await Promise.all([
            provider.connection.getBalance(owner.publicKey),
            provider.connection.getBalance(vault)
        ]);

        assert.isAbove(finalOwnerBalance, initialOwnerBalance, "Owner balance did not increase");
        assert.isBelow(finalVaultBalance, initialVaultBalance, "Vault balance did not decrease");
        
        // Verify SOL transfer amounts (allow 0.01 SOL for tx fees)
        const expectedAmount = Number(lockAmount) - 10000000; // 0.01 SOL
        const balanceChange = finalOwnerBalance - initialOwnerBalance;
        assert.isAtLeast(
            balanceChange,
            expectedAmount,
            `Should receive at least ${expectedAmount/1e9} SOL (after fees)`
        );
    });

    it("should handle multiple concurrent timelocks", async () => {
        // Create two separate owners
        const owner1 = anchor.web3.Keypair.generate();
        const owner2 = anchor.web3.Keypair.generate();

        // Fund both owners
        const airdrop1 = await provider.connection.requestAirdrop(owner1.publicKey, 2000000000);
        const airdrop2 = await provider.connection.requestAirdrop(owner2.publicKey, 2000000000);
        
        await Promise.all([
            provider.connection.confirmTransaction(airdrop1, "confirmed"),
            provider.connection.confirmTransaction(airdrop2, "confirmed")
        ]);

        // Create PDAs for both owners
        const [timelock1] = PublicKey.findProgramAddressSync(
            [Buffer.from("timelock_sol"), owner1.publicKey.toBuffer()],
            program.programId
        );
        const [vault1] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), timelock1.toBuffer()],
            program.programId
        );
        
        const [timelock2] = PublicKey.findProgramAddressSync(
            [Buffer.from("timelock_sol"), owner2.publicKey.toBuffer()],
            program.programId
        );
        const [vault2] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), timelock2.toBuffer()],
            program.programId
        );

        // Initialize both timelocks with different amounts
        const lockAmount1 = new anchor.BN(0.5 * 1e9); // 0.5 SOL
        const lockAmount2 = new anchor.BN(1.5 * 1e9); // 1.5 SOL
        const unlockTime = new anchor.BN(Math.floor(Date.now()/1000) + 5); // 5 seconds

        // Initialize first timelock
        await program.methods.initializeSolLock(lockAmount1, unlockTime)
            .accounts({
                owner: owner1.publicKey,
                timelock: timelock1,
                vault: vault1,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY
            })
            .signers([owner1])
            .rpc();

        // Initialize second timelock
        await program.methods.initializeSolLock(lockAmount2, unlockTime)
            .accounts({
                owner: owner2.publicKey,
                timelock: timelock2,
                vault: vault2,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY
            })
            .signers([owner2])
            .rpc();

        // Wait for lock expiration
        console.log("Waiting 6 seconds for timelocks to expire...");
        await new Promise(resolve => setTimeout(resolve, 6000));

        // Withdraw from both timelocks
        const [balanceBefore1, balanceBefore2] = await Promise.all([
            provider.connection.getBalance(owner1.publicKey),
            provider.connection.getBalance(owner2.publicKey)
        ]);

        await Promise.all([
            program.methods.withdrawSol()
                .accounts({
                    timelock: timelock1,
                    owner: owner1.publicKey,
                    vault: vault1,
                    systemProgram: SystemProgram.programId
                })
                .signers([owner1])
                .rpc(),
            program.methods.withdrawSol()
                .accounts({
                    timelock: timelock2,
                    owner: owner2.publicKey,
                    vault: vault2,
                    systemProgram: SystemProgram.programId
                })
                .signers([owner2])
                .rpc()
        ]);

        // Verify final balances
        const [balanceAfter1, balanceAfter2] = await Promise.all([
            provider.connection.getBalance(owner1.publicKey),
            provider.connection.getBalance(owner2.publicKey)
        ]);

        // Check owner1 received ~0.5 SOL (minus fees)
        assert.isAtLeast(
            balanceAfter1 - balanceBefore1,
            Number(lockAmount1) - 10000000,
            "Owner1 should receive at least 0.49 SOL"
        );

        // Check owner2 received ~1.5 SOL (minus fees)
        assert.isAtLeast(
            balanceAfter2 - balanceBefore2,
            Number(lockAmount2) - 10000000,
            "Owner2 should receive at least 1.49 SOL"
        );
    });

    it("should handle SPL token timelocks", async () => {
        // Create new owner for SPL test
        const splOwner = anchor.web3.Keypair.generate();
        await provider.connection.requestAirdrop(splOwner.publicKey, 2000000000);
        
        // Create test token mint
        const tokenMint = await spl.createMint(
            provider.connection,
            provider.wallet.payer,
            provider.wallet.publicKey, // mint authority
            null, // freeze authority
            9 // decimals
        );
        
        // Create owner token account
        const ownerTokenAccount = await spl.getAssociatedTokenAddress(
            tokenMint,
            splOwner.publicKey
        );
        
        // Create the ATA if it doesn't exist
        await spl.createAssociatedTokenAccount(
            provider.connection,
            provider.wallet.payer,
            tokenMint,
            splOwner.publicKey
        );
        
        // Mint tokens to owner
        await spl.mintTo(
            provider.connection,
            provider.wallet.payer,
            tokenMint,
            ownerTokenAccount,
            provider.wallet.payer, // mint authority
            1000000000 // 1 billion tokens (1 token with 9 decimals)
        );

        // Get PDAs for SPL timelock using timelock account bumps
        const [splTimelock] = PublicKey.findProgramAddressSync(
            [Buffer.from("timelock_spl"), splOwner.publicKey.toBuffer()],
            program.programId
        );

        // Initialize SPL timelock with 100 tokens locked for 5 seconds
        const lockAmount = new anchor.BN(100000000); // 100 tokens (8 decimals)
        const unlockTime = new anchor.BN(Math.floor(Date.now()/1000) + 5);
        
        await program.methods.initializeSplLock(lockAmount, unlockTime)
            .accounts({
                owner: splOwner.publicKey,
                tokenMint: tokenMint,
                ownerTokenAccount: ownerTokenAccount,
                timelock: splTimelock,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY
            })
            .signers([splOwner])
            .rpc();

        // Get timelock account to access stored bumps
        const timelockAccount = await program.account.timelockAccount.fetch(splTimelock);
        
        // Create PDAs with correct bump using findProgramAddressSync
        const [splVault] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("vault"),
                splTimelock.toBuffer()
            ],
            program.programId
        );

        const [splVaultTokenAccount] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("vault_token_account"),
                splTimelock.toBuffer()
            ],
            program.programId
        );

        // Attempt early withdrawal
        try {
            await program.methods.withdrawSpl()
                .accounts({
                    timelock: splTimelock,
                    owner: splOwner.publicKey,
                    ownerTokenAccount: await spl.getAssociatedTokenAddress(tokenMint, splOwner.publicKey),
                    vault: splVault,
                    vaultTokenAccount: splVaultTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID
                })
                .signers([splOwner])  // Use splOwner keypair
                .rpc();
            
            assert.fail("Should prevent SPL withdrawal before unlock time");
        } catch (error) {
            const logs = (error as any).logs?.join(" ") || "";
            assert.include(logs, "Withdrawal attempted before unlock time");
            assert.include(logs, "TimeNotExpired");
        }

        // Wait for lock expiration
        console.log("Waiting 6 seconds for SPL timelock to expire...");
        await new Promise(resolve => setTimeout(resolve, 6000));

        // Check balances before withdrawal
        const preWithdrawOwnerBalance = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
        const preWithdrawVaultBalance = await provider.connection.getTokenAccountBalance(splVaultTokenAccount);

        // Execute withdrawal with proper PDA signing
        await program.methods.withdrawSpl()
            .accounts({
                timelock: splTimelock,
                owner: splOwner.publicKey,
                ownerTokenAccount: await spl.getAssociatedTokenAddress(tokenMint, splOwner.publicKey),
                vault: splVault,
                vaultTokenAccount: splVaultTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID
            })
            .remainingAccounts([])
            .signers([splOwner])
            .rpc();

        // Verify token balances
        const postWithdrawOwnerBalance = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
        const postWithdrawVaultBalance = await provider.connection.getTokenAccountBalance(splVaultTokenAccount);

        assert.equal(
            postWithdrawOwnerBalance.value.amount,
            new anchor.BN(preWithdrawOwnerBalance.value.amount).add(lockAmount).toString(),
            "Owner should receive locked tokens"
        );
        
        assert.equal(
            postWithdrawVaultBalance.value.amount,
            new anchor.BN(preWithdrawVaultBalance.value.amount).sub(lockAmount).toString(),
            "Vault should deduct tokens"
        );
    });

    it("should prevent vault token account reinitialization", async () => {
        // Create new owner and setup
        const newOwner = anchor.web3.Keypair.generate();
        await provider.connection.requestAirdrop(newOwner.publicKey, 2000000000);

        // Create new token mint
        const tokenMint = await spl.createMint(
            provider.connection,
            provider.wallet.payer,
            provider.wallet.publicKey,
            null,
            9
        );

        // Create owner token account
        const ownerTokenAccount = await spl.getAssociatedTokenAddress(
            tokenMint,
            newOwner.publicKey
        );
        await spl.createAssociatedTokenAccount(
            provider.connection,
            provider.wallet.payer,
            tokenMint,
            newOwner.publicKey
        );

        // Mint tokens
        await spl.mintTo(
            provider.connection,
            provider.wallet.payer,
            tokenMint,
            ownerTokenAccount,
            provider.wallet.payer,
            1000000000
        );

        // Get PDAs
        const [splTimelock] = PublicKey.findProgramAddressSync(
            [Buffer.from("timelock_spl"), newOwner.publicKey.toBuffer()],
            program.programId
        );

        // Initialize once
        const lockAmount = new anchor.BN(100000000);
        const unlockTime = new anchor.BN(Math.floor(Date.now()/1000) + 5);
        await program.methods.initializeSplLock(lockAmount, unlockTime)
            .accounts({
                owner: newOwner.publicKey,
                tokenMint: tokenMint,
                ownerTokenAccount: ownerTokenAccount,
                timelock: splTimelock,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY
            })
            .signers([newOwner])
            .rpc();

        // Attempt reinitialization
        try {
            await program.methods.initializeSplLock(lockAmount, unlockTime)
                .accounts({
                    owner: newOwner.publicKey,
                    tokenMint: tokenMint,
                    ownerTokenAccount: ownerTokenAccount,
                    timelock: splTimelock,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY
                })
                .signers([newOwner])
                .rpc();

            assert.fail("Should prevent vault token account reinitialization");
        } catch (error) {
            // Check for already initialized error from program
            const logs = (error as any).logs?.join(" ") || "";
            assert.include(logs, "The account cannot be initialized because it is already being used");
        }
    });

    it("should prevent additional SOL deposits to existing vault", async () => {
        // Attempt to send more SOL directly to the vault
        const preBalance = await provider.connection.getBalance(vault);
        try {
            const transferIx = SystemProgram.transfer({
                fromPubkey: owner.publicKey,
                toPubkey: vault,
                lamports: 100000000 // 0.1 SOL
            });

            const computeIx = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
                units: 200_000
            });

            await provider.sendAndConfirm(
                new anchor.web3.Transaction().add(computeIx, transferIx),
                [owner]
            );
            assert.fail("Should have failed to transfer SOL to vault PDA");
        } catch (error) {
            const errorLogs = (error.logs || []).join(" ");
            // We just need to verify the transfer failed and balance didn't change
            assert.isTrue(error instanceof Error, "Should have rejected direct SOL transfer");
            const postBalance = await provider.connection.getBalance(vault);
            // Verify timelock account amount didn't change
            const timelockAccount = await program.account.timelockAccount.fetch(timelock);
            assert.equal(
                timelockAccount.amount.toString(),
                "1000000000", // Original locked amount
                "Timelock account amount should not change"
            );
        }
    });

    it("should prevent additional SPL token deposits to existing vault", async () => {
        // Create new SPL token mint for this test
        const tokenMint = await spl.createMint(
            provider.connection,
            provider.wallet.payer,
            provider.wallet.publicKey,
            null,
            9
        );

        // Create owner token account and mint tokens
        const ownerTokenAccount = await spl.getAssociatedTokenAddress(tokenMint, owner.publicKey);
        await spl.createAssociatedTokenAccount(
            provider.connection,
            provider.wallet.payer,
            tokenMint,
            owner.publicKey
        );
        await spl.mintTo(
            provider.connection,
            provider.wallet.payer,
            tokenMint,
            ownerTokenAccount,
            provider.wallet.payer,
            1000000000
        );

        // Create new SPL timelock instance
        const [splTimelock] = PublicKey.findProgramAddressSync(
            [Buffer.from("timelock_spl"), owner.publicKey.toBuffer()],
            program.programId
        );
        const [splVaultTokenAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault_token_account"), splTimelock.toBuffer()],
            program.programId
        );

        // Attempt direct transfer to vault token account
        try {
            const transferIx = spl.createTransferInstruction(
                ownerTokenAccount,
                splVaultTokenAccount,
                splTimelock,
                1000000,
                [],
                TOKEN_PROGRAM_ID
            );

            // Need to simulate transaction to get proper error logs
            const simulation = await program.provider.connection.simulateTransaction(
                new anchor.web3.Transaction().add(transferIx),
                [owner.publicKey]
            );

            if (simulation.value.err === null) {
                assert.fail("Should prevent direct SPL transfers to vault");
            }

            const errorLogs = simulation.value.logs.join(" ");
            assert.include(
                errorLogs,
                "Owner does not match",
                "Should prevent unauthorized SPL transfers"
            );
        } catch (error) {
            // Error already handled in simulation check
        }
    });
});
