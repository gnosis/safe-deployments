import fs from 'fs';
import path from 'path';
import { SingletonDeploymentJSON } from '../types';

const KNOWN_ADDRESS_TYPES = ['canonical', 'eip155', 'zksync'];

function assetPath(...paths: string[]) {
  return path.join(__dirname, '..', 'assets', ...paths);
}

function versions() {
  const files = fs.readdirSync(assetPath());
  return files.filter((file) => file.match(/^v[0-9]+\.[0-9]+\.[0-9]+$/));
}

function versionFiles(version: string) {
  const files = fs.readdirSync(assetPath(version));
  return files.filter((file) => file.match(/.*\.json$/));
}

async function readAsset(version: string, file: string) {
  return await fs.promises.readFile(assetPath(version, file), 'utf-8');
}

async function readAssetJSON(version: string, file: string): Promise<SingletonDeploymentJSON | undefined> {
  return JSON.parse(await readAsset(version, file));
}

describe('assets/', () => {
  for (const version of versions()) {
    describe(version, () => {
      for (const file of versionFiles(version)) {
        describe(file, () => {
          describe('networkAddresses', () => {
            it('should be sorted by chain ID', async () => {
              // We manually parse the JSON here, since ECMA `JSON.parse` will
              // always order fields with numeric keys.
              const json = await readAsset(version, file);
              const networkAddresses = json.replace(/^[\s\S]*"networkAddresses" *: *\{([^}]*)\}[\s\S]*$/, '$1').trim();
              const keys = networkAddresses.split(',').map((pair) => {
                const [key] = pair.split(':');
                return parseInt(key.trim().replace(/^"(.*)"$/, '$1'));
              });
              const sorted = [...keys].sort((a, b) => a - b);
              expect(keys).toEqual(sorted);
            });

            it('networks should only contain canonical address types', async () => {
              const deploymentJson = await readAssetJSON(version, file);
              if (!deploymentJson) {
                throw new Error(`Failed to read asset ${version}/${file}`);
              }

              const { networkAddresses, addresses } = deploymentJson;
              const canonicalAddressTypes = Object.keys(addresses);

              for (const addressType of Object.values(networkAddresses)) {
                if (Array.isArray(addressType)) {
                  for (const type of addressType) {
                    expect(canonicalAddressTypes).toContain(type);
                  }
                } else {
                  expect(canonicalAddressTypes).toContain(addressType);
                }
              }
            });
          });

          it('should only contain known address types', async () => {
            const deploymentJson = await readAssetJSON(version, file);
            if (!deploymentJson) {
              throw new Error(`Failed to read asset ${version}/${file}`);
            }
            const { addresses } = deploymentJson;

            for (const addressType of Object.keys(addresses)) {
              expect(KNOWN_ADDRESS_TYPES).toContain(addressType);
            }
          });

          it('no network can contain zksync address together with other address types', async () => {
            const deploymentJson = await readAssetJSON(version, file);
            if (!deploymentJson) {
              throw new Error(`Failed to read asset ${version}/${file}`);
            }
            const { networkAddresses } = deploymentJson;

            for (const network of Object.keys(networkAddresses)) {
              const addressTypes = networkAddresses[network];

              if (Array.isArray(addressTypes)) {
                expect(addressTypes).not.toContain('zksync');
              }
            }
          });
        });
      }

      describe('networkAddresses', () => {
        it('should contain the same networks in all files', async () => {
          const files = versionFiles(version);
          const networkCounts: Record<string, number> = {};
          for (const file of files) {
            const deploymentJson = await readAssetJSON(version, file);
            if (!deploymentJson) {
              throw new Error(`Failed to read asset ${version}/${file}`);
            }
            const { networkAddresses } = deploymentJson;
            for (const network of Object.keys(networkAddresses)) {
              networkCounts[network] = (networkCounts[network] ?? 0) + 1;
            }
          }
          for (const [network, count] of Object.entries(networkCounts)) {
            expect([network, count]).toEqual([network, files.length]);
          }
        });

        it('the address types for a network should be the same in all files', async () => {
          const files = versionFiles(version);
          const networkAddressMap: Record<string, string | string[]> = {};

          for (const file of files) {
            const deploymentJson = await readAssetJSON(version, file);
            if (!deploymentJson) {
              throw new Error(`Failed to read asset ${version}/${file}`);
            }
            const { networkAddresses } = deploymentJson;

            for (const [network, addressTypes] of Object.entries(networkAddresses)) {
              if (!networkAddressMap[network]) {
                networkAddressMap[network] = addressTypes;
              } else {
                // We use try/catch here to make the error message more readable.
                // Without it the error message looks like:
                // Expected: "canonical"
                // Actual:   ["canonical", "eip155"]
                try {
                  expect(addressTypes).toEqual(networkAddressMap[network]);
                } catch (e) {
                  console.log(`
                    Discrepancy in network ${network}
                    Expected: ${networkAddressMap[network]}
                    Actual:   ${addressTypes}
                  `);
                  throw e;
                }
              }
            }
          }
        });
      });
    });
  }
});
