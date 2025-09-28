
import machine
import neopixel
import utime
import time
from pico_lte.utils.status import Status
from pico_lte.core import PicoLTE
import micropyGPS
import ucryptolib
from pico_lte.common import debug
import network
import urequests
import json

pin = machine.Pin(15)
np = neopixel.NeoPixel(pin, 1)

neopixel_current_color = (0, 0, 0)

# use UART1 for GNSS, UART0 is taken by the LTE modem
gnss_uart = machine.UART(1, 9600)

gnssm = micropyGPS.MicropyGPS(location_formatting="dd")

def set_neopixel_color_rgb(rgb):
    global neopixel_current_color
    np[0] = rgb
    neopixel_current_color = rgb
    np.write()

def lerp(a, b, t):
    return a + (b - a) * t
    
def get_and_parse_cell_information_lean():
    cellinfo_response = None
    cellinfo = picoLTE.base.get_cell_information("servingcell")
    if cellinfo is not None:
        cellinfo_response = cellinfo["response"]
        # example response: ['+QENG: "servingcell","NOCONN","eMTC","FDD",310,410,B0DD811,152,5110,12,3,3,5003,-88,-11,-62,11,41', 'OK']
        # this corresponds to: +QENG: "servingcell",<state>,<RAT>,<is_tdd>,<MCC>,<MNC>,<cellID>,<PCI>,<EARFCN>,<freq_band_ind>,<UL_bandwidth>,<DL_bandwidth>,<TAC>,<RSRP>,<RSRQ>,<RSSI>,<SINR>,<srxlev>
        # we want to parse and return the RAT, MCC, MNC, cellID, TAC, and RSSI
        # the TAC and cellID are hex strings, so we need to convert them to integers
        cellinfo_response = cellinfo_response[0].split(",")
        rat = cellinfo_response[2]
        rat = rat[1:-1]
        mcc = int(cellinfo_response[4])
        mnc = int(cellinfo_response[5])
        cellid = int(cellinfo_response[6], 16)
        tac = int(cellinfo_response[12], 16)
        rssi = int(cellinfo_response[15])
        rsrp = int(cellinfo_response[13])
        return {
            "rat": rat,
            "mcc": mcc,
            "mnc": mnc,
            "cellid": cellid,
            "enbid": cellid_to_enbid(cellid),
            "tac": tac,
            "rssi": rssi,
            "rsrp": rsrp,
        }
    else:
        debug.critical("Could not get cell information")
        
def cellid_to_enbid(cellid):
    cell_id_bits = 8
    enbid = cellid >> cell_id_bits
    return enbid
        
gnss_lat = ""
gnss_long = ""
gnss_timestamp = ""
gnss_has_fix_now = False

# Configuration
SEND_INTERVAL_SECONDS = 60  # Send location every 60 seconds
MAX_RETRY_ATTEMPTS = 3
RETRY_DELAY_MS = 5000

# Network Mode Configuration - Toggle between WiFi and LTE
USE_WIFI = True  # Set to False to use LTE instead of WiFi

# WiFi Configuration - PUT YOUR WIFI CREDENTIALS HERE
WIFI_SSID = "YOUR_WIFI_SSID"  # Replace with your WiFi network name
WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"  # Replace with your WiFi password

# API Configuration
API_URL = "https://willi.study/api/data/uplink/"

last_send_time = 0
network_connected = False
consecutive_send_failures = 0
wlan = None

# Initialize network based on configuration
picoLTE = None
module_imei = "WIFI_DEVICE"  # Default identifier when using WiFi

if USE_WIFI:
    debug.info("=== WIFI MODE ENABLED ===")
    set_neopixel_color_rgb((0, 100, 255))  # Blue for WiFi mode
    
    # Initialize WiFi
    def connect_to_wifi():
        global wlan, network_connected
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
        
        debug.info("Connecting to WiFi network: {}".format(WIFI_SSID))
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        
        # Wait for connection with timeout
        timeout = 30  # 30 seconds timeout
        start_time = time.time()
        
        while not wlan.isconnected() and (time.time() - start_time) < timeout:
            debug.info("Waiting for WiFi connection...")
            set_neopixel_color_rgb((0, 0, 255))  # Blue pulse while connecting
            time.sleep_ms(500)
            set_neopixel_color_rgb((0, 50, 100))
            time.sleep_ms(500)
        
        if wlan.isconnected():
            network_connected = True
            ip_config = wlan.ifconfig()
            debug.info("WiFi connected successfully!")
            debug.info("IP Address: {}".format(ip_config[0]))
            debug.info("Subnet: {}".format(ip_config[1]))
            debug.info("Gateway: {}".format(ip_config[2]))
            set_neopixel_color_rgb((0, 255, 100))  # Green-blue for connected
            
            # Use MAC address as device identifier
            import ubinascii
            mac = ubinascii.hexlify(wlan.config('mac'), ':').decode()
            global module_imei
            module_imei = "WIFI_{}".format(mac.replace(':', ''))
            debug.info("Device ID: {}".format(module_imei))
            return True
        else:
            network_connected = False
            debug.error("Failed to connect to WiFi")
            set_neopixel_color_rgb((255, 0, 0))  # Red for failed
            return False
    
    # Connect to WiFi
    connect_to_wifi()
    
else:
    debug.info("=== LTE MODE ENABLED ===")
    set_neopixel_color_rgb((255, 0, 0))
    debug.info("Waiting for modem...")
    picoLTE = PicoLTE()
    set_neopixel_color_rgb((255, 0, 200))

    # Configure network scan sequence for faster connection
    debug.info("Configuring network scan sequence...")
    try:
        # Set scan sequence to GSM priority (01) for faster connection
        # Options: 00=Automatic (eMTC→NB-IoT→GSM), 01=GSM priority, 02=eMTC priority
        scan_response = picoLTE.base.config_network_scan_sequence("00")
        debug.info("Network scan sequence set: {}".format(scan_response))
    except Exception as e:
        debug.warning("Could not set network scan sequence: {}".format(e))
        
    imei_command_response = picoLTE.base.get_module_imei()
    if imei_command_response is not None:
        module_imei = imei_command_response["response"][0]
    else:
        debug.critical("Could not get IMEI")
        raise Exception("Could not get IMEI")
    debug.info("IMEI: {}".format(module_imei))
    debug.info("Registering to LTE/GSM network...")
    picoLTE.network.register_network()
    debug.info(get_and_parse_cell_information_lean())
    picoLTE.http.set_context_id()
    debug.info("Configuring PDP...")
    picoLTE.network.get_pdp_ready()
    picoLTE.http.set_server_url(API_URL)
    network_connected = False  # Will be set by check_network_connection()

def send_location_to_api():
    """Send GPS location and cell info to API with retry logic"""
    global last_send_time, consecutive_send_failures
    
    for attempt in range(MAX_RETRY_ATTEMPTS):
        try:
            # Prepare payload
            payload = {
                "device_id": module_imei,
                "latitude": gnss_lat,
                "longitude": gnss_long,
                "timestamp": gnss_timestamp,
                "connection_type": "wifi" if USE_WIFI else "lte"
            }
            
            # Add cell info if using LTE
            if not USE_WIFI:
                cell_info = None
                try:
                    cell_info = get_and_parse_cell_information_lean()
                    if cell_info:
                        payload["cell_info"] = cell_info
                except Exception as e:
                    debug.warning("Could not get cell info: {}".format(e))
            
            # Convert payload to JSON string
            payload_str = json.dumps(payload)
            
            # Send HTTP POST request
            debug.info("Sending location (attempt {}/{}): lat={}, lon={}".format(
                attempt + 1, MAX_RETRY_ATTEMPTS, gnss_lat, gnss_long))
            
            if USE_WIFI:
                # Use urequests for WiFi
                headers = {'Content-Type': 'application/json'}
                response = urequests.post(API_URL, data=payload_str, headers=headers)
                
                if response.status_code == 200:
                    debug.info("Location sent successfully via WiFi")
                    response.close()
                    last_send_time = time.time()
                    consecutive_send_failures = 0
                    # Flash green to indicate successful send
                    set_neopixel_color_rgb((0, 255, 0))
                    time.sleep_ms(200)
                    set_neopixel_color_rgb((0, 100, 255))
                    return True
                else:
                    debug.error("Failed to send location via WiFi: Status {}".format(response.status_code))
                    response.close()
                    if attempt < MAX_RETRY_ATTEMPTS - 1:
                        debug.info("Retrying in {} seconds...".format(RETRY_DELAY_MS/1000))
                        time.sleep_ms(RETRY_DELAY_MS)
            else:
                # Use picoLTE for LTE
                response = picoLTE.http.post(data=payload_str)
                
                if response and response.get("status") == Status.SUCCESS:
                    debug.info("Location sent successfully via LTE")
                    last_send_time = time.time()
                    consecutive_send_failures = 0
                    # Flash green to indicate successful send
                    set_neopixel_color_rgb((0, 255, 0))
                    time.sleep_ms(200)
                    set_neopixel_color_rgb((0, 0, 100))
                    return True
                else:
                    debug.error("Failed to send location via LTE: {}".format(response))
                    if attempt < MAX_RETRY_ATTEMPTS - 1:
                        debug.info("Retrying in {} seconds...".format(RETRY_DELAY_MS/1000))
                        time.sleep_ms(RETRY_DELAY_MS)
                
        except Exception as e:
            debug.error("Error sending location (attempt {}): {}".format(attempt + 1, e))
            if attempt < MAX_RETRY_ATTEMPTS - 1:
                time.sleep_ms(RETRY_DELAY_MS)
    
    # All retries failed
    consecutive_send_failures += 1
    debug.error("Failed to send location after {} attempts".format(MAX_RETRY_ATTEMPTS))
    # Flash red to indicate failure
    set_neopixel_color_rgb((255, 0, 0))
    time.sleep_ms(500)
    return False

def check_network_connection():
    """Check if network (WiFi or LTE) is connected"""
    global network_connected
    
    if USE_WIFI:
        # Check WiFi connection
        if wlan and wlan.isconnected():
            network_connected = True
            return True
        else:
            network_connected = False
            # Try to reconnect
            debug.warning("WiFi disconnected, attempting to reconnect...")
            return connect_to_wifi()
    else:
        # Check LTE connection
        try:
            network_status = picoLTE.network.get_network_registration_status()
            if network_status and network_status.get("status") == Status.SUCCESS:
                # Check if registered to network (1 = registered home, 5 = registered roaming)
                reg_status = network_status.get("response", [None])[0]
                if reg_status in ["1", "5"]:
                    network_connected = True
                    return True
            network_connected = False
            return False
        except:
            network_connected = False
            return False

def process_gnss_data():
    """Process GNSS data and update global variables"""
    global gnss_lat
    global gnss_long
    global gnss_timestamp
    global gnss_has_fix_now
    
    num_bytes_available = gnss_uart.any()
    if num_bytes_available > 0:
        byte_data = gnss_uart.read(num_bytes_available)
        for byte in byte_data:
            if 10 <= byte <= 126:
                gnssm.update(chr(byte))

    hasFix = gnssm.fix_stat > 0
    if hasFix:
        lat = gnssm.latitude[0]
        long = gnssm.longitude[0]
       
        if gnssm.latitude[1] == "S":
            lat = -lat
        if gnssm.longitude[1] == "W":
            long = -long
        
        datestamp = gnssm.date
        timeonly = gnssm.timestamp
        year = "20{}".format(datestamp[2])
        month = str(datestamp[1])
        day = str(datestamp[0])
        hour = str(timeonly[0])
        minute = str(timeonly[1])
        second = str(timeonly[2])
        if len(month) == 1:
            month = "0{}".format(month)
        if len(day) == 1:
            day = "0{}".format(day)
        if len(hour) == 1:
            hour = "0{}".format(hour)
        if len(minute) == 1:
            minute = "0{}".format(minute)
        if len(second) == 3:
            second = "0{}".format(second)
        timestamp_iso = "{}-{}-{}T{}:{}:{}Z".format(year, month, day, hour, minute, second)
        
        gnss_lat = lat
        gnss_long = long
        gnss_timestamp = timestamp_iso
        gnss_has_fix_now = True
        return True
    else:
        gnss_has_fix_now = False
        return False

def main_tracking_loop():
    """Main loop that handles GNSS reading and periodic location sending"""
    global last_send_time, consecutive_send_failures
    
    last_gnss_data = None
    last_status_log = 0
    status_log_interval = 30  # Log status every 30 seconds
    
    debug.info("Starting main tracking loop...")
    debug.info("Configuration:")
    debug.info("  - Send interval: {} seconds".format(SEND_INTERVAL_SECONDS))
    debug.info("  - Max retry attempts: {}".format(MAX_RETRY_ATTEMPTS))
    debug.info("  - Retry delay: {} ms".format(RETRY_DELAY_MS))
    
    while True:
        try:
            # Process GNSS data
            has_fix = process_gnss_data()
            
            # Periodic status logging
            current_time = time.time()
            if (current_time - last_status_log) >= status_log_interval:
                connection_type = "WiFi" if USE_WIFI else "LTE"
                debug.info("Status - GPS: {}, {}: {}, Failures: {}".format(
                    "Fixed" if has_fix else "No Fix",
                    connection_type,
                    "Connected" if network_connected else "Disconnected", 
                    consecutive_send_failures))
                last_status_log = current_time
            
            if has_fix:
                current_gnss_data = (gnss_lat, gnss_long, gnss_timestamp)
                
                # Only log if GPS data changed significantly
                if current_gnss_data != last_gnss_data:
                    num_sats_in_use = gnssm.satellites_in_use
                    debug.info("GNSS fix: {}, {}, {}, {} sats".format(
                        gnss_lat, gnss_long, gnss_timestamp, num_sats_in_use))
                    set_neopixel_color_rgb((0, 255, 0))
                    time.sleep_ms(50)
                    set_neopixel_color_rgb((0, 0, 100))
                    last_gnss_data = current_gnss_data
                
                # Check if it's time to send location
                if (current_time - last_send_time) >= SEND_INTERVAL_SECONDS:
                    if check_network_connection():
                        debug.info("Sending scheduled location update...")
                        if send_location_to_api():
                            debug.info("Location update successful")
                        else:
                            # If we have too many consecutive failures, try to re-register/reconnect
                            if consecutive_send_failures >= 3:
                                if USE_WIFI:
                                    debug.warning("Too many send failures, attempting WiFi reconnection...")
                                    connect_to_wifi()
                                else:
                                    debug.warning("Too many send failures, attempting network re-registration...")
                                    try:
                                        picoLTE.network.register_network()
                                        picoLTE.network.get_pdp_ready()
                                        consecutive_send_failures = 0
                                    except Exception as e:
                                        debug.error("Failed to re-register network: {}".format(e))
                    else:
                        connection_type = "WiFi" if USE_WIFI else "LTE"
                        debug.warning("Skipping location send - No {} connection".format(connection_type))
                        set_neopixel_color_rgb((255, 100, 0))  # Orange for no connection
                        time.sleep_ms(200)
                        # Try to reconnect if disconnected
                        if USE_WIFI:
                            debug.info("Attempting to reconnect to WiFi...")
                            connect_to_wifi()
                        else:
                            try:
                                debug.info("Attempting to reconnect to LTE...")
                                picoLTE.network.register_network()
                                picoLTE.network.get_pdp_ready()
                            except:
                                pass
            else:
                # No GPS fix - flash red briefly
                set_neopixel_color_rgb((255, 0, 20))
                
        except Exception as e:
            debug.error("Error in main loop: {}".format(e))
            # Don't crash the loop, just continue
            
        time.sleep_ms(500)  # Small delay to prevent CPU hogging

# Start the main tracking loop
main_tracking_loop()
    