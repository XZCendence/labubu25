
import machine
import neopixel
import utime
import time
from pico_lte.utils.status import Status
from pico_lte.core import PicoLTE
import hashlib
import micropyGPS
import ucryptolib
from pico_lte.common import debug

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

def kne(x="XiKf4NdsYqLF93UMpsaKFPerlcIGJIz3"):
    return hashlib.sha256(x.encode()).digest().hex()

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

set_neopixel_color_rgb((255, 0, 0))
debug.info("Waiting for modem...")
picoLTE = PicoLTE()
set_neopixel_color_rgb((255, 0, 200))

_kr = "XiKf4NdsYqLF93UMpsaKFPerlcIGJIz3"
    
imei_command_response = picoLTE.base.get_module_imei()
module_imei = None
if imei_command_response is not None:
    module_imei = imei_command_response["response"][0]
else:
    debug.critical("Could not get IMEI")
    raise Exception("Could not get IMEI")

tid = hashlib.sha256(module_imei.encode()).digest().hex()
debug.info("tid: {}".format(tid))
debug.info("Registering to LTE network...")
picoLTE.network.register_network()
debug.info(get_and_parse_cell_information_lean())
picoLTE.http.set_context_id()
debug.info("Configuring PDP...")
picoLTE.network.get_pdp_ready()
# uplink URL
picoLTE.http.set_server_url("https://jax.xzinternal.com/api/data/uplink")

def gnss_read_loop():
    global gnss_lat
    global gnss_long
    global gnss_timestamp
    global gnss_has_fix_now
    last_gnss_data = None
    while True:
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
            timestamp = timestamp_iso
            num_sats_in_use = gnssm.satellites_in_use
            num_sats_in_view = gnssm.satellites_in_view

            current_gnss_data = (lat, long, timestamp, num_sats_in_use)
            if current_gnss_data != last_gnss_data:
                gnss_lat = lat
                gnss_long = long
                gnss_timestamp = timestamp
                gnss_has_fix_now = True
                debug.info("GNSS has fix: {}, {}, {}, {} satellites in use, {} satellites in view".format(lat, long, timestamp, num_sats_in_use, num_sats_in_view))
                set_neopixel_color_rgb((100, 255, 0))
                time.sleep_ms(50)
                set_neopixel_color_rgb((0, 0, 100))
                last_gnss_data = current_gnss_data
        else:
            gnss_has_fix_now = False
            debug.info("No GNSS fix")
            set_neopixel_color_rgb((255, 0, 20))
            time.sleep_ms(500)
        
gnss_read_loop()
    