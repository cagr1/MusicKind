#include <keyfinder/keyfinder.h>

#include <cstring>
#include <climits>
#include <iostream>
#include <iterator>
#include <vector>

int main() {
  std::vector<char> bytes((std::istreambuf_iterator<char>(std::cin)), {});
  const size_t count = bytes.size() / sizeof(float);
  if (count == 0 || count > UINT_MAX) return 2;

  KeyFinder::AudioData audio;
  audio.setChannels(1);
  audio.setFrameRate(44100);
  audio.addToSampleCount(static_cast<unsigned int>(count));
  audio.addToFrameCount(static_cast<unsigned int>(count));
  for (size_t i = 0; i < count; ++i) {
    float value;
    std::memcpy(&value, bytes.data() + i * sizeof(float), sizeof(float));
    audio.setSample(static_cast<unsigned int>(i), value);
  }

  KeyFinder::KeyFinder finder;
  const char* names[] = {"A", "Am", "Bb", "Bbm", "B", "Bm", "C", "Cm",
    "Db", "Dbm", "D", "Dm", "Eb", "Ebm", "E", "Em", "F", "Fm",
    "Gb", "Gbm", "G", "Gm", "Ab", "Abm"};
  const auto key = finder.keyOfAudio(audio);
  if (key < KeyFinder::A_MAJOR || key > KeyFinder::A_FLAT_MINOR) return 3;
  std::cout << "{\"key\":\"" << names[key] << "\"}";
  return 0;
}
