SAVE_IMAGE_PATH = "aaa.jpg"
DEST_IMAGE_PATH = "./image.jpg"
SRC_IMAGE_PATH = "/fpga/aaa.jpg"

import sys
import pathlib
import time
import argparse
import result

# Ensure we use the local freewili module
current_dir = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(current_dir))

from freewili import FreeWili
from freewili.fw import FreeWiliProcessorType as FwProcessor

progcount = 0

def print_progress(message: str) -> None:
    global progcount
    progcount += 1
    if progcount % 15 == 0:
        timestamp = time.strftime("[%H:%M:%S]")
        print(f"{timestamp} {message}")

def take_picture(fw: FreeWili, path: str):
    # use the found device's serial interface
    serial = fw.main_serial
    print(f"Serial opened: {serial}")
    try:
        result = serial.open()
        if result.is_err():
            print(f"Failed to connect: {result.unwrap_err()}")
            return
        
        print("Connected successfully!")
        
        # result = fw.wileye_set_brightness(75)
        # if result.is_ok():
        #     print("Brightness set successfully!")
        # else:
        #     print(f"Failed to set brightness: {result.unwrap_err()}")
        
        # result = fw.wileye_set_contrast(60)
        # if result.is_ok():
        #     print("Contrast set successfully!")
        # else:
        #     print(f"Failed to set contrast: {result.unwrap_err()}")

        result = fw.wileye_set_resolution(2)
        if result.is_ok():
            print("Resolution set successfully!")
        else:
            print(f"Failed to set resolution: {result.unwrap_err()}")

        result = serial.wileye_take_picture(1, path)

        if result.is_ok():
            print(f"Picture taken successfully! Saved on {path}")
        else:
            print(f"Failed to take picture: {result.unwrap_err()}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        serial.close()
        print("Serial disconnected from FreeWili device")

def transfer_picture(fw: FreeWili, processor: FwProcessor, source_file: str, destination_path: str):
    print(f"Downloading {source_file} from {processor.name} processor...")

    try:
        # ensure destination directory exists
        dest_path = pathlib.Path(destination_path)
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        result = fw.get_file(
            source_file=source_file,
            destination_path=dest_path,
            processor=processor,
            event_cb=print_progress
        )

        if result.is_ok():
            print(f"Image saved to: {dest_path.absolute()}")
            print(f"Image size: {dest_path.stat().st_size} bytes")
        else:
            print(f"Error: {result.unwrap_err()}")
    except Exception as e:
        print(f"Download failed: {e}")

def main():
    parser = argparse.ArgumentParser(description="Capture and download an image from FreeWili Wileye camera")
    parser.add_argument("--dest", dest="dest", default=DEST_IMAGE_PATH, help="Destination path on host for the downloaded image")
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
    
    take_picture(fw, SAVE_IMAGE_PATH)

    time.sleep(10) # very precise timing

    # ensure directory
    dest = pathlib.Path(args.dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    transfer_picture(fw, FwProcessor.Main, SRC_IMAGE_PATH, str(dest))

if __name__ == '__main__':
    main()
