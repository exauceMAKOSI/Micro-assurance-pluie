'npx hardhat clean' running (wd: C:\Users\exauc\Documents\Micro-assurance)
'npx hardhat clean --global' running (wd: C:\Users\exauc\Documents\Micro-assurance)
'npx hardhat compile --force' running (wd: C:\Users\exauc\Documents\Micro-assurance)
**THIS CHECKLIST IS NOT COMPLETE**. Use `--show-ignored-findings` to show all the results.
Summary
 - [timestamp](#timestamp) (3 results) (Low)
## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-0
[RainfallInsurance.settleSeason(uint256,uint256)](contracts/Rainfallinsurance.sol#L110-L121) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(seasonId < seasons.length,Saison inconnue)](contracts/Rainfallinsurance.sol#L114)
	- [require(bool,string)(block.timestamp >= s.end,Saison en cours)](contracts/Rainfallinsurance.sol#L116)
	- [require(bool,string)(! s.settled,Deja reglee)](contracts/Rainfallinsurance.sol#L117)

contracts/Rainfallinsurance.sol#L110-L121


 - [ ] ID-1
[RainfallInsurance.buyPolicy(uint256)](contracts/Rainfallinsurance.sol#L92-L106) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(seasonId < seasons.length,Saison inconnue)](contracts/Rainfallinsurance.sol#L93)
	- [require(bool,string)(! s.settled && block.timestamp < s.end,Saison close)](contracts/Rainfallinsurance.sol#L95)

contracts/Rainfallinsurance.sol#L92-L106


 - [ ] ID-2
[RainfallInsurance.payPolicy(uint256)](contracts/Rainfallinsurance.sol#L125-L141) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(s.settled,Saison non reglee)](contracts/Rainfallinsurance.sol#L130)

contracts/Rainfallinsurance.sol#L125-L141


