DEST_OUTPUT_PATH = "./audio.txt"
DURATION = 5.0

import struct
import sys
import math
import pathlib
import time
import argparse
import result

# Ensure we use the local freewili module
current_dir = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(current_dir))

from freewili import FreeWili
from freewili.framing import ResponseFrame
from freewili.types import AudioData, EventType

audio_bytes = b""
cur_audio_data = []

def event_handler(event_type: EventType, frame: ResponseFrame, data: AudioData) -> None:
    if event_type != EventType.Audio:
        return
    # print('data', data.data)
    cur_audio_data.append(data.data)

def get_average_decibels(fw: FreeWili) -> float:
    global audio_bytes

    fw.set_event_callback(event_handler)
    fw.enable_audio_events(True).expect("Failed to enable audio events")
    start_time = time.time()
    print("Listening for audio events...")

    while True:
        try:
            fw.process_events()
            if cur_audio_data:
                for data in cur_audio_data:
                    # print(f"\tWriting audio data: {data!r}" + " " * 30)
                    # convert data to bytes (little-endian 16-bit signed)
                    audio_bytes += b"".join(struct.pack("<h", sample) for sample in data)
                cur_audio_data.clear()
            # time limit
            if time.time() - start_time > DURATION:
                break
        except KeyboardInterrupt:
            print("\nStopping audio recording...")
            break
    
    if not audio_bytes:
        return 0.0
    
    samples = list(struct.unpack("<" + "h" * (len(audio_bytes) // 2), audio_bytes))

    # find rms
    rms = math.sqrt(sum(sample**2 for sample in samples) / len(samples))
    if rms == 0:
        return -float('inf') # silence
    
    decibels = 20 * math.log10(rms / 32768) + 106.0
    return decibels

def main():
    parser = argparse.ArgumentParser(description="Capture and average decibels from FreeWili Wileye microphone")
    parser.add_argument("--dest", dest="dest", default=DEST_OUTPUT_PATH, help="Destination path on host for the average decibel data")
    args = parser.parse_args()

    try:
        fw = FreeWili.find_first().expect("No FreeWili devices found")
        print(f"Found FreeWili device: {fw}")
    except result.UnwrapError as e:
        print(f"Error: {e}")
        print("\nMake sure your FreeWili device is:")
        print("1. Connected via USB")
        print("2. Powered on")
        print("3. Recognized by your system")
        return
    
    avg = get_average_decibels(fw)

    # ensure destination directory exists
    dest = pathlib.Path(args.dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(str(dest), 'w') as f:
        f.write(str(avg))

if __name__ == '__main__':
    main()
