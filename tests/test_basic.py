import os
import sys
import tempfile
import json
from pathlib import Path

# Add the src directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

def test_audio_features():
    """Test audio feature extraction"""
    try:
        from audio_features import extract_features
        
        # Create a dummy audio file for testing
        # This is a simplified test - in real scenarios you'd have actual audio files
        print("✅ Audio features module imported successfully")
        return True
    except ImportError as e:
        print(f"❌ Failed to import audio_features: {e}")
        return False
    except Exception as e:
        print(f"❌ Error testing audio features: {e}")
        return False

def test_ffmpeg_check():
    """Test FFmpeg availability check"""
    try:
        from run_classification import check_ffmpeg
        ffmpeg_available = check_ffmpeg()
        print(f"📺 FFmpeg available: {ffmpeg_available}")
        return True
    except ImportError as e:
        print(f"❌ Failed to import run_classification: {e}")
        return False
    except Exception as e:
        print(f"❌ Error checking FFmpeg: {e}")
        return False

def test_genre_config():
    """Test genre configuration loading"""
    try:
        config_path = Path(__file__).parent / 'config' / 'genres.json'
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                genres = json.load(f)
            print(f"✅ Loaded {len(genres)} genres from config")
            return True
        else:
            print("⚠️  Genre config file not found, using defaults")
            return True
    except Exception as e:
        print(f"❌ Error loading genre config: {e}")
        return False

def test_temp_file_creation():
    """Test temporary file creation functionality"""
    try:
        import tempfile
        temp_dir = tempfile.mkdtemp()
        temp_file = Path(temp_dir) / 'test.txt'
        temp_file.write_text('test content')
        
        if temp_file.exists() and temp_file.read_text() == 'test content':
            print("✅ Temporary file creation works")
            # Cleanup
            temp_file.unlink()
            os.rmdir(temp_dir)
            return True
        else:
            print("❌ Temporary file creation failed")
            return False
    except Exception as e:
        print(f"❌ Error testing temporary files: {e}")
        return False

def run_all_tests():
    """Run all tests"""
    print("🧪 Running MusicKind Tests...")
    print("=" * 50)
    
    tests = [
        ("Audio Features", test_audio_features),
        ("FFmpeg Check", test_ffmpeg_check),
        ("Genre Config", test_genre_config),
        ("Temp Files", test_temp_file_creation),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n🔍 Testing {test_name}...")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ Test {test_name} crashed: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 50)
    print("📊 Test Results:")
    passed = 0
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\n🎯 Summary: {passed}/{len(results)} tests passed")
    
    if passed == len(results):
        print("🎉 All tests passed!")
        return True
    else:
        print(f"⚠️  {len(results) - passed} tests failed")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)