const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const E18 = (n) => ethers.parseUnits(n.toString(), 18);

describe("RainfallInsurance", function () {
  async function deployFixture() {
    const [admin, oracle, farmer, provider, stranger] =
      await ethers.getSigners();

    const token = await (await ethers.getContractFactory("TestStableToken")).deploy();
    const insurance = await (
      await ethers.getContractFactory("RainfallInsurance")
    ).deploy(await token.getAddress(), admin.address, oracle.address);
    const addr = await insurance.getAddress();

    // Le fournisseur de pool dépose 500 jetons
    await token.transfer(provider.address, E18(1000));
    await token.connect(provider).approve(addr, E18(1000));
    await insurance.connect(provider).depositToPool(E18(500));

    // L'agriculteur reçoit 1000 jetons de test
    await token.connect(farmer).faucet();
    await token.connect(farmer).approve(addr, E18(1000));

    // Saison d'une heure
    await insurance.startSeason(3600);

    return { token, insurance, admin, oracle, farmer, provider, stranger };
  }

  it("crée une police et encaisse la prime", async function () {
    const { insurance, token, farmer } = await loadFixture(deployFixture);
    await expect(insurance.connect(farmer).buyPolicy(0))
      .to.emit(insurance, "PolicyCreated")
      .withArgs(0, farmer.address, 0);
    expect(await token.balanceOf(farmer.address)).to.equal(E18(990));
  });

  it("indemnise en cas de sécheresse", async function () {
    const { insurance, token, oracle, farmer } = await loadFixture(deployFixture);
    await insurance.connect(farmer).buyPolicy(0);
    await time.increase(3601);
    await insurance.connect(oracle).settleSeason(0, 10);
    await expect(insurance.payPolicy(0))
      .to.emit(insurance, "PayoutTriggered")
      .withArgs(0, farmer.address, E18(100));
    expect(await token.balanceOf(farmer.address)).to.equal(E18(1090));
  });

  it("indemnise en cas d'inondation", async function () {
    const { insurance, token, oracle, farmer } = await loadFixture(deployFixture);
    await insurance.connect(farmer).buyPolicy(0);
    await time.increase(3601);
    await insurance.connect(oracle).settleSeason(0, 350);
    await insurance.payPolicy(0);
    expect(await token.balanceOf(farmer.address)).to.equal(E18(1090));
  });

  it("ne paie rien si la pluie est normale", async function () {
    const { insurance, token, oracle, farmer } = await loadFixture(deployFixture);
    await insurance.connect(farmer).buyPolicy(0);
    await time.increase(3601);
    await insurance.connect(oracle).settleSeason(0, 100);
    await expect(insurance.payPolicy(0))
      .to.emit(insurance, "PolicyClosedNoPayout")
      .withArgs(0);
    expect(await token.balanceOf(farmer.address)).to.equal(E18(990));
  });

  it("respecte les seuils exacts (20 mm et 200 mm = pas de paiement)", async function () {
    const { insurance } = await loadFixture(deployFixture);
    expect(await insurance.isTriggered(20)).to.equal(false);
    expect(await insurance.isTriggered(200)).to.equal(false);
    expect(await insurance.isTriggered(19)).to.equal(true);
    expect(await insurance.isTriggered(201)).to.equal(true);
  });

  it("refuse un règlement par un non-oracle", async function () {
    const { insurance, stranger } = await loadFixture(deployFixture);
    await time.increase(3601);
    await expect(
      insurance.connect(stranger).settleSeason(0, 10)
    ).to.be.revertedWithCustomError(insurance, "AccessControlUnauthorizedAccount");
  });

  it("refuse un règlement avant la fin de la saison", async function () {
    const { insurance, oracle } = await loadFixture(deployFixture);
    await expect(
      insurance.connect(oracle).settleSeason(0, 10)
    ).to.be.revertedWith("Saison en cours");
  });

  it("refuse un double paiement", async function () {
    const { insurance, oracle, farmer } = await loadFixture(deployFixture);
    await insurance.connect(farmer).buyPolicy(0);
    await time.increase(3601);
    await insurance.connect(oracle).settleSeason(0, 10);
    await insurance.payPolicy(0);
    await expect(insurance.payPolicy(0)).to.be.revertedWith("Deja traitee");
  });

  it("empêche de retirer les fonds réservés aux indemnisations", async function () {
    const { insurance, farmer, provider } = await loadFixture(deployFixture);
    await insurance.connect(farmer).buyPolicy(0);
    await expect(
      insurance.connect(provider).withdrawFromPool(E18(450))
    ).to.be.revertedWith("Fonds reserves");
    await insurance.connect(provider).withdrawFromPool(E18(400));
  });
});

