cmake_minimum_required(VERSION 3.15)

# ตั้งชื่อโปรเจกต์
project(AITrainerBackend CXX)

# กำหนดให้ใช้ C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 1. ค้นหา OpenCV (ระบบของคุณต้องมีการติดตั้ง OpenCV ไว้อยู่แล้ว)
find_package(OpenCV REQUIRED)

# 2. จัดการ Dependencies อัตโนมัติด้วย FetchContent
include(FetchContent)

# ดาวน์โหลด nlohmann/json (สำหรับจัดการ JSON)
FetchContent_Declare(
    json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
)
FetchContent_MakeAvailable(json)

# ดาวน์โหลด asio (เป็นไลบรารีพื้นฐานที่ Crow ต้องใช้ในการจัดการ Network)
FetchContent_Declare(
    asio
    URL https://github.com/chriskohlhoff/asio/archive/refs/tags/asio-1.30.2.tar.gz
)
FetchContent_MakeAvailable(asio)

# ดาวน์โหลด Crow C++ (สำหรับทำ Web/WebSocket Server)
FetchContent_Declare(
    Crow
    URL https://github.com/CrowCpp/Crow/releases/download/v1.2.0/Crow-1.2.0.tar.gz
)
FetchContent_MakeAvailable(Crow)

# 3. กำหนดไฟล์ Source Code ที่จะใช้สร้างโปรแกรม
# (ชี้ไปที่ไฟล์ AITrainer.cpp ของคุณ)
add_executable(AITrainerBackend AITrainer.cpp)

# 4. เชื่อมโยง Library ต่างๆ เข้ากับโปรแกรม
target_link_libraries(AITrainerBackend 
    PRIVATE 
    ${OpenCV_LIBS}
    nlohmann_json::nlohmann_json
    Crow::Crow
)

# เพิ่ม Include directories สำหรับ asio ให้ Crow มองเห็น
target_include_directories(AITrainerBackend PRIVATE ${asio_SOURCE_DIR}/asio/include)
target_compile_definitions(AITrainerBackend PRIVATE ASIO_STANDALONE)

# 5. สำหรับ Windows: เชื่อมโยง Comdlg32 (เผื่อคุณยังอยากเก็บฟังก์ชันเลือกไฟล์วิดีโอไว้ทดสอบ)
if(WIN32)
    target_link_libraries(AITrainerBackend PRIVATE Comdlg32)
endif()